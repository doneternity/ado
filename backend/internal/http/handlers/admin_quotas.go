package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

type AdminQuotas struct{ q *db.Queries }

func NewAdminQuotas(q *db.Queries) *AdminQuotas { return &AdminQuotas{q: q} }

func (h *AdminQuotas) Get(w http.ResponseWriter, r *http.Request) {
	global, err := h.q.GetSetting(r.Context(), "global_daily_quota")
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "get quota"))
		return
	}
	users, err := h.q.ListUsersAdmin(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list users"))
		return
	}
	type override struct {
		UserID uuid.UUID `json:"userId"`
		Email  string    `json:"email"`
		Limit  int32     `json:"limit"`
	}
	var overrides []override
	for _, u := range users {
		if u.DailyQuotaOverride != nil {
			overrides = append(overrides, override{u.ID, u.Email, *u.DailyQuotaOverride})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"globalLimit": global, "overrides": overrides})
}

func (h *AdminQuotas) SetGlobal(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Limit int `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Limit < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "limit must be >= 1"))
		return
	}
	if err := h.q.SetSetting(r.Context(), db.SetSettingParams{
		Key: "global_daily_quota", Value: strconv.Itoa(req.Limit),
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set quota"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminQuotas) SetUserOverride(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		Limit int32 `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Limit < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "limit must be >= 1"))
		return
	}
	if err := h.q.SetUserQuotaOverride(r.Context(), db.SetUserQuotaOverrideParams{
		ID: id, DailyQuotaOverride: &req.Limit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set override"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminQuotas) RemoveUserOverride(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	if err := h.q.RemoveUserQuotaOverride(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "remove override"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
