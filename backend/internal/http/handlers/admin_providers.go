package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/keyencrypt"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || req.BaseURL == "" || req.APIKey == "" {
		apperr.Write(w, apperr.BadRequest("INVALID", "name, baseUrl, and apiKey are required"))
		return
	}
	encKey, err := keyencrypt.Encrypt(req.APIKey, h.d.ProviderKeySecret)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "encrypt key"))
		return
	}
	count, _ := h.d.Q.CountProviders(r.Context())
	isActive := count == 0
	p, err := h.d.Q.CreateProvider(r.Context(), db.CreateProviderParams{
		Name:     req.Name,
		BaseUrl:  req.BaseURL,
		ApiKey:   encKey,
		IsActive: isActive,
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create provider"))
		return
	}
	if isActive {
		h.d.Registry.Swap(p.BaseUrl, req.APIKey) // pass plaintext to registry
	}
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "bad JSON"))
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
		if p.IsActive {
			h.d.Registry.Swap(p.BaseUrl, req.APIKey) // pass plaintext to registry
		}
	} else if p.IsActive {
		plainKey, err := keyencrypt.Decrypt(p.ApiKey, h.d.ProviderKeySecret)
		if err != nil {
			apperr.Write(w, apperr.Internal("INTERNAL", "decrypt key"))
			return
		}
		h.d.Registry.Swap(p.BaseUrl, plainKey)
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
	if err := h.d.Q.SetProviderActive(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set active"))
		return
	}
	active, err := h.d.Q.GetActiveProvider(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load active"))
		return
	}
	plainKey, err := keyencrypt.Decrypt(active.ApiKey, h.d.ProviderKeySecret)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "decrypt key"))
		return
	}
	h.d.Registry.Swap(active.BaseUrl, plainKey)
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
	w.WriteHeader(http.StatusNoContent)
}
