package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

type AdminUsers struct{ q *db.Queries }

func NewAdminUsers(q *db.Queries) *AdminUsers { return &AdminUsers{q: q} }

func (h *AdminUsers) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListUsersAdmin(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list users"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rows)
}

func (h *AdminUsers) SetRole(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Role != "user" && req.Role != "admin") {
		apperr.Write(w, apperr.BadRequest("INVALID", "role must be 'user' or 'admin'"))
		return
	}
	if err := h.q.SetUserRole(r.Context(), db.SetUserRoleParams{ID: id, Role: req.Role}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set role"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminUsers) SetBanned(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Banned bool `json:"banned"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "bad JSON"))
		return
	}
	if err := h.q.SetUserBanned(r.Context(), db.SetUserBannedParams{ID: id, Banned: req.Banned}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set banned"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
