package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type AdminUsers struct{ q *db.Queries }

func NewAdminUsers(q *db.Queries) *AdminUsers { return &AdminUsers{q: q} }

type adminUserDTO struct {
	ID                 uuid.UUID `json:"id"`
	Email              string    `json:"email"`
	Role               string    `json:"role"`
	Banned             bool      `json:"banned"`
	CreatedAt          time.Time `json:"createdAt"`
	DailyQuotaOverride *int32    `json:"dailyQuotaOverride"`
	RequestsToday      int32     `json:"requestsToday"`
}

func (h *AdminUsers) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListUsersAdmin(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list users"))
		return
	}
	out := make([]adminUserDTO, len(rows))
	for i, u := range rows {
		out[i] = adminUserDTO{
			ID:                 u.ID,
			Email:              u.Email,
			Role:               u.Role,
			Banned:             u.Banned,
			CreatedAt:          u.CreatedAt.Time,
			DailyQuotaOverride: u.DailyQuotaOverride,
			RequestsToday:      u.RequestsToday,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
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
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	v := validate.Fields()
	v.Field("role", req.Role).Required().OneOf("user", "admin")
	if err := v.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
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
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if err := h.q.SetUserBanned(r.Context(), db.SetUserBannedParams{ID: id, Banned: req.Banned}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set banned"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
