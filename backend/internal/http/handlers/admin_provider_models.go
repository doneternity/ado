package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/keyencrypt"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

// maxModelChoices bounds how many model IDs one provider's choice can list.
const maxModelChoices = 2000

type providerModelsOut struct {
	Mode   string              `json:"mode"` // "all" (all except IDs) or "only" (just IDs)
	IDs    []string            `json:"ids"`
	Models []proxy.ModelChoice `json:"models"`          // everything the provider offers, hidden ones too
	Error  string              `json:"error,omitempty"` // why Models couldn't be read
}

// Models lists a provider's models with which ones ADO offers, for Admin →
// Providers → Models. The list comes from the provider's keys in the chain, or
// for an inactive provider, a fetch with its first active key.
func (h *AdminProviders) Models(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "that isn't a valid provider id"))
		return
	}
	p, err := h.d.Q.GetProvider(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "there's no provider with that id"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the provider; try again in a moment"))
		return
	}
	out := providerModelsOut{Mode: p.ModelMode, IDs: p.ModelIds}
	if out.IDs == nil {
		out.IDs = []string{}
	}
	out.Models = h.d.Registry.ProviderChoices(id.String())
	if out.Models == nil {
		out.Models, out.Error = h.fetchChoices(r, p)
	}
	if out.Models == nil {
		out.Models = []proxy.ModelChoice{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// fetchChoices reads a provider's model list with its first active key.
func (h *AdminProviders) fetchChoices(r *http.Request, p db.Provider) ([]proxy.ModelChoice, string) {
	keys, err := h.d.Q.ListProviderKeys(r.Context())
	if err != nil {
		return nil, "couldn't load the provider's keys"
	}
	for _, k := range keys {
		if k.ProviderID != p.ID || !k.IsActive {
			continue
		}
		key, err := keyencrypt.Decrypt(k.ApiKey, h.d.ProviderKeySecret)
		if err != nil {
			continue
		}
		f := proxy.New(p.BaseUrl, key)
		f.ModelSuffix = p.ModelSuffix
		if choices, ok := f.FetchChoices(r.Context()); ok {
			return choices, ""
		}
		return nil, "the provider's model list couldn't be read; check its address and key"
	}
	return nil, "add an active key to this provider to see its models"
}

// SetModels saves which of a provider's models ADO offers and applies it at
// once (the chain is rebuilt and each key re-filters the list it has).
func (h *AdminProviders) SetModels(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "that isn't a valid provider id"))
		return
	}
	var req struct {
		Mode string   `json:"mode"`
		IDs  []string `json:"ids"`
	}
	if err := validate.Bind(r, &req, validate.MaxBytes(256<<10)); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if req.Mode != "all" && req.Mode != "only" {
		apperr.Write(w, apperr.BadRequest("INVALID", `mode must be "all" (all models except the listed ones) or "only" (just the listed ones)`))
		return
	}
	ids := make([]string, 0, len(req.IDs))
	seen := map[string]bool{}
	for _, m := range req.IDs {
		m = strings.TrimSpace(m)
		if m == "" || seen[m] {
			continue
		}
		if len(m) > maxModelName {
			apperr.Write(w, apperr.BadRequest("INVALID", "model IDs are at most 200 characters"))
			return
		}
		seen[m] = true
		ids = append(ids, m)
	}
	if len(ids) > maxModelChoices {
		apperr.Write(w, apperr.BadRequest("INVALID", "that's more than 2,000 model IDs"))
		return
	}
	n, err := h.d.Q.SetProviderModels(r.Context(), db.SetProviderModelsParams{ID: id, ModelMode: req.Mode, ModelIds: ids})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't save the model choice; try again in a moment"))
		return
	}
	if n == 0 {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "there's no provider with that id"))
		return
	}
	h.rebuildChain(r)
	h.noteProvider(r, id, map[string]any{"mode": req.Mode, "models": len(ids)})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"mode": req.Mode, "ids": ids})
}
