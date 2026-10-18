package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/keyencrypt"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type AdminProvidersDeps struct {
	Q                 *db.Queries
	Registry          *proxy.Registry
	ProviderKeySecret string
}

type AdminProviders struct{ d AdminProvidersDeps }

func NewAdminProviders(d AdminProvidersDeps) *AdminProviders { return &AdminProviders{d: d} }

// maxKeysPerRequest caps how many keys one add (or create) call takes.
const maxKeysPerRequest = 50

type providerKeyItem struct {
	ID       uuid.UUID `json:"id"`
	Label    string    `json:"label"`
	Suffix   string    `json:"suffix"`
	IsActive bool      `json:"isActive"`
}

type providerItem struct {
	ID       uuid.UUID         `json:"id"`
	Name     string            `json:"name"`
	BaseURL  string            `json:"baseUrl"`
	IsActive bool              `json:"isActive"`
	Priority int32             `json:"priority"`
	Keys     []providerKeyItem `json:"keys"`
}

// keySuffix is the last 4 characters of a decrypted key: enough to tell keys
// apart, never enough to use one.
func keySuffix(enc, secret string) string {
	key, err := keyencrypt.Decrypt(enc, secret)
	if err != nil {
		return "????"
	}
	if len(key) > 4 {
		return key[len(key)-4:]
	}
	return key
}

func maskedKey(k db.ProviderKey, secret string) providerKeyItem {
	return providerKeyItem{ID: k.ID, Label: k.Label, Suffix: keySuffix(k.ApiKey, secret), IsActive: k.IsActive}
}

// RebuildChain loads every active key of every active provider into the proxy
// chain, in failover order. Each provider's keys share a Group, so requests
// take turns across them (proxy.rotateGroups) and fail over between them.
func RebuildChain(ctx context.Context, q *db.Queries, secret string, reg *proxy.Registry) {
	rows, err := q.ListActiveProviderKeys(ctx)
	if err != nil {
		slog.Warn("rebuild chain: list active provider keys failed", "err", err)
		return
	}
	chain := make([]*proxy.Forwarder, 0, len(rows))
	group := 0
	var lastProvider uuid.UUID
	for _, row := range rows {
		key, err := keyencrypt.Decrypt(row.ApiKey, secret)
		if err != nil {
			slog.Warn("rebuild chain: decrypt key failed", "provider", row.ProviderID, "key", row.ID, "err", err)
			continue
		}
		if row.ProviderID != lastProvider {
			group++
			lastProvider = row.ProviderID
		}
		f := proxy.New(row.BaseUrl, key)
		f.Group = group
		f.Label = fmt.Sprintf("%s …%s", row.Name, keySuffix(row.ApiKey, secret))
		if row.Label != "" {
			f.Label = fmt.Sprintf("%s %q …%s", row.Name, row.Label, keySuffix(row.ApiKey, secret))
		}
		chain = append(chain, f)
	}
	reg.Swap(chain)
}

func (h *AdminProviders) rebuildChain(r *http.Request) {
	RebuildChain(r.Context(), h.d.Q, h.d.ProviderKeySecret, h.d.Registry)
}

func (h *AdminProviders) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.d.Q.ListProviders(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list providers"))
		return
	}
	keys, err := h.d.Q.ListProviderKeys(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list provider keys"))
		return
	}
	byProvider := make(map[uuid.UUID][]providerKeyItem)
	for _, k := range keys {
		byProvider[k.ProviderID] = append(byProvider[k.ProviderID], maskedKey(k, h.d.ProviderKeySecret))
	}
	out := make([]providerItem, len(rows))
	for i, p := range rows {
		ks := byProvider[p.ID]
		if ks == nil {
			ks = []providerKeyItem{}
		}
		out[i] = providerItem{ID: p.ID, Name: p.Name, BaseURL: p.BaseUrl, IsActive: p.IsActive, Priority: p.Priority, Keys: ks}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// cleanKeys trims, drops blanks and duplicates, and checks the count and length.
func cleanKeys(raw []string) ([]string, error) {
	seen := make(map[string]bool, len(raw))
	out := make([]string, 0, len(raw))
	for _, k := range raw {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		if len(k) > 512 {
			return nil, fmt.Errorf("each API key must be at most 512 characters")
		}
		seen[k] = true
		out = append(out, k)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("at least one API key is required")
	}
	if len(out) > maxKeysPerRequest {
		return nil, fmt.Errorf("at most %d keys at a time", maxKeysPerRequest)
	}
	return out, nil
}

// addKeys encrypts and stores keys for a provider.
func (h *AdminProviders) addKeys(ctx context.Context, providerID uuid.UUID, keys []string, label string) ([]providerKeyItem, error) {
	out := make([]providerKeyItem, 0, len(keys))
	for _, k := range keys {
		enc, err := keyencrypt.Encrypt(k, h.d.ProviderKeySecret)
		if err != nil {
			return out, err
		}
		row, err := h.d.Q.CreateProviderKey(ctx, db.CreateProviderKeyParams{ProviderID: providerID, Label: label, ApiKey: enc})
		if err != nil {
			return out, err
		}
		out = append(out, maskedKey(row, h.d.ProviderKeySecret))
	}
	return out, nil
}

func (h *AdminProviders) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string   `json:"name"`
		BaseURL  string   `json:"baseUrl"`
		APIKey   string   `json:"apiKey"`  // a single key (older clients)
		APIKeys  []string `json:"apiKeys"` // or several
		Priority int32    `json:"priority"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	vc := validate.Fields()
	vc.Field("name", req.Name).Required().MaxLen(100)
	vc.Field("baseUrl", req.BaseURL).Required().MaxLen(500).URL()
	if err := vc.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	keys, err := cleanKeys(append(req.APIKeys, req.APIKey))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	p, err := h.d.Q.CreateProvider(r.Context(), db.CreateProviderParams{
		Name:     req.Name,
		BaseUrl:  req.BaseURL,
		IsActive: true,
		Priority: req.Priority,
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create provider"))
		return
	}
	added, err := h.addKeys(r.Context(), p.ID, keys, "")
	if err != nil {
		// Don't leave a provider without its keys behind.
		_ = h.d.Q.DeleteProvider(r.Context(), p.ID)
		apperr.Write(w, apperr.Internal("INTERNAL", "save keys"))
		return
	}
	h.rebuildChain(r)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(providerItem{ID: p.ID, Name: p.Name, BaseURL: p.BaseUrl, IsActive: p.IsActive, Priority: p.Priority, Keys: added})
}

func (h *AdminProviders) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Name     string `json:"name"`
		BaseURL  string `json:"baseUrl"`
		Priority int32  `json:"priority"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	vc := validate.Fields()
	vc.Field("name", req.Name).Required().MaxLen(100)
	vc.Field("baseUrl", req.BaseURL).Required().MaxLen(500).URL()
	if err := vc.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if _, err := h.d.Q.UpdateProviderMeta(r.Context(), db.UpdateProviderMetaParams{
		ID: id, Name: req.Name, BaseUrl: req.BaseURL, Priority: req.Priority,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "update provider"))
		return
	}
	h.rebuildChain(r)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminProviders) SetActive(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Active bool `json:"active"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if err := h.d.Q.SetProviderActiveState(r.Context(), db.SetProviderActiveStateParams{
		ID: id, IsActive: req.Active,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set active"))
		return
	}
	h.rebuildChain(r)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminProviders) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	if err := h.d.Q.DeleteProvider(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete"))
		return
	}
	h.rebuildChain(r)
	w.WriteHeader(http.StatusNoContent)
}

// AddKeys adds one or more keys to an existing provider.
func (h *AdminProviders) AddKeys(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		APIKeys []string `json:"apiKeys"`
		Label   string   `json:"label"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	req.Label = strings.TrimSpace(req.Label)
	if len(req.Label) > 60 {
		apperr.Write(w, apperr.BadRequest("INVALID", "label must be at most 60 characters"))
		return
	}
	keys, err := cleanKeys(req.APIKeys)
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if _, err := h.d.Q.GetProvider(r.Context(), id); err != nil {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "provider not found"))
		return
	}
	added, err := h.addKeys(r.Context(), id, keys, req.Label)
	if err != nil {
		h.rebuildChain(r) // some may have been saved
		apperr.Write(w, apperr.Internal("INTERNAL", "save keys"))
		return
	}
	h.rebuildChain(r)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(added)
}

func (h *AdminProviders) SetKeyActive(w http.ResponseWriter, r *http.Request) {
	id, err1 := uuid.Parse(chi.URLParam(r, "id"))
	keyID, err2 := uuid.Parse(chi.URLParam(r, "keyId"))
	if err1 != nil || err2 != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Active bool `json:"active"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	n, err := h.d.Q.SetProviderKeyActive(r.Context(), db.SetProviderKeyActiveParams{ID: keyID, ProviderID: id, IsActive: req.Active})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set key active"))
		return
	}
	if n == 0 {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "key not found"))
		return
	}
	h.rebuildChain(r)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminProviders) DeleteKey(w http.ResponseWriter, r *http.Request) {
	id, err1 := uuid.Parse(chi.URLParam(r, "id"))
	keyID, err2 := uuid.Parse(chi.URLParam(r, "keyId"))
	if err1 != nil || err2 != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	n, err := h.d.Q.DeleteProviderKey(r.Context(), db.DeleteProviderKeyParams{ID: keyID, ProviderID: id})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete key"))
		return
	}
	if n == 0 {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "key not found"))
		return
	}
	h.rebuildChain(r)
	w.WriteHeader(http.StatusNoContent)
}
