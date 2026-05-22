package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

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

type providerItem struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	BaseURL   string    `json:"baseUrl"`
	KeySuffix string    `json:"keySuffix"`
	IsActive  bool      `json:"isActive"`
}

func maskedProvider(p db.Provider, secret string) providerItem {
	key, _ := keyencrypt.Decrypt(p.ApiKey, secret)
	suf := key
	if len(suf) > 4 {
		suf = suf[len(suf)-4:]
	}
	return providerItem{p.ID, p.Name, p.BaseUrl, suf, p.IsActive}
}

// swapToActive loads the most-recently-updated active provider and points the
// registry at it. If no active provider exists, the registry is cleared so
// proxy requests fail with a clear error instead of silently using a stale key.
func (h *AdminProviders) swapToActive(r *http.Request) {
	active, err := h.d.Q.GetActiveProvider(r.Context())
	if errors.Is(err, pgx.ErrNoRows) {
		h.d.Registry.Swap("", "")
		return
	}
	if err != nil {
		return
	}
	plainKey, err := keyencrypt.Decrypt(active.ApiKey, h.d.ProviderKeySecret)
	if err != nil {
		return
	}
	h.d.Registry.Swap(active.BaseUrl, plainKey)
}

func (h *AdminProviders) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.d.Q.ListProviders(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list providers"))
		return
	}
	out := make([]providerItem, len(rows))
	for i, p := range rows {
		out[i] = maskedProvider(p, h.d.ProviderKeySecret)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (h *AdminProviders) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string `json:"name"`
		BaseURL string `json:"baseUrl"`
		APIKey  string `json:"apiKey"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	vc := validate.Fields()
	vc.Field("name", req.Name).Required().MaxLen(100)
	vc.Field("baseUrl", req.BaseURL).Required().MaxLen(500).URL()
	vc.Field("apiKey", req.APIKey).Required().MaxLen(512)
	if err := vc.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	encKey, err := keyencrypt.Encrypt(req.APIKey, h.d.ProviderKeySecret)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "encrypt key"))
		return
	}
	p, err := h.d.Q.CreateProvider(r.Context(), db.CreateProviderParams{
		Name:     req.Name,
		BaseUrl:  req.BaseURL,
		ApiKey:   encKey,
		IsActive: true,
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create provider"))
		return
	}
	// Newly created provider becomes active immediately.
	h.d.Registry.Swap(p.BaseUrl, req.APIKey)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(maskedProvider(p, h.d.ProviderKeySecret))
}

func (h *AdminProviders) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Name    string `json:"name"`
		BaseURL string `json:"baseUrl"`
		APIKey  string `json:"apiKey"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	vc := validate.Fields()
	vc.Field("name", req.Name).Required().MaxLen(100)
	vc.Field("baseUrl", req.BaseURL).Required().MaxLen(500).URL()
	if req.APIKey != "" {
		vc.Field("apiKey", req.APIKey).MaxLen(512)
	}
	if err := vc.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	p, err := h.d.Q.UpdateProviderMeta(r.Context(), db.UpdateProviderMetaParams{
		ID: id, Name: req.Name, BaseUrl: req.BaseURL,
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "update provider"))
		return
	}
	if req.APIKey != "" {
		encKey, err := keyencrypt.Encrypt(req.APIKey, h.d.ProviderKeySecret)
		if err != nil {
			apperr.Write(w, apperr.Internal("INTERNAL", "encrypt key"))
			return
		}
		if err := h.d.Q.UpdateProviderKey(r.Context(), db.UpdateProviderKeyParams{
			ID: id, ApiKey: encKey,
		}); err != nil {
			apperr.Write(w, apperr.Internal("INTERNAL", "update key"))
			return
		}
		p.ApiKey = encKey
	}
	if p.IsActive {
		h.swapToActive(r)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(maskedProvider(p, h.d.ProviderKeySecret))
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
	if req.Active {
		// Point the registry at this specific provider.
		p, err := h.d.Q.GetProvider(r.Context(), id)
		if err == nil {
			if plainKey, derr := keyencrypt.Decrypt(p.ApiKey, h.d.ProviderKeySecret); derr == nil {
				h.d.Registry.Swap(p.BaseUrl, plainKey)
			}
		}
	} else {
		// Deactivated — fall back to the next active provider or clear.
		h.swapToActive(r)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminProviders) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	// Check if this was the active provider before deleting.
	p, _ := h.d.Q.GetProvider(r.Context(), id)
	wasActive := p.IsActive

	if err := h.d.Q.DeleteProvider(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete"))
		return
	}
	if wasActive {
		h.swapToActive(r)
	}
	w.WriteHeader(http.StatusNoContent)
}
