package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
)

type AdminProvidersDeps struct {
	Q        *db.Queries
	Registry *proxy.Registry
}

type AdminProviders struct{ d AdminProvidersDeps }

func NewAdminProviders(d AdminProvidersDeps) *AdminProviders { return &AdminProviders{d: d} }

func (h *AdminProviders) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.d.Q.ListProviders(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list providers"))
		return
	}
	type item struct {
		ID        uuid.UUID `json:"id"`
		Name      string    `json:"name"`
		BaseURL   string    `json:"baseUrl"`
		KeySuffix string    `json:"keySuffix"`
		IsActive  bool      `json:"isActive"`
	}
	out := make([]item, len(rows))
	for i, p := range rows {
		suf := p.ApiKey
		if len(suf) > 4 {
			suf = suf[len(suf)-4:]
		}
		out[i] = item{p.ID, p.Name, p.BaseUrl, suf, p.IsActive}
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
	count, _ := h.d.Q.CountProviders(r.Context())
	isActive := count == 0
	p, err := h.d.Q.CreateProvider(r.Context(), db.CreateProviderParams{
		Name:     req.Name,
		BaseUrl:  req.BaseURL,
		ApiKey:   req.APIKey,
		IsActive: isActive,
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create provider"))
		return
	}
	if isActive {
		h.d.Registry.Swap(p.BaseUrl, p.ApiKey)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(p)
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
		if err := h.d.Q.UpdateProviderKey(r.Context(), db.UpdateProviderKeyParams{
			ID: id, ApiKey: req.APIKey,
		}); err != nil {
			apperr.Write(w, apperr.Internal("INTERNAL", "update key"))
			return
		}
		p.ApiKey = req.APIKey
	}
	if p.IsActive {
		h.d.Registry.Swap(p.BaseUrl, p.ApiKey)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(p)
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
	h.d.Registry.Swap(active.BaseUrl, active.ApiKey)
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
