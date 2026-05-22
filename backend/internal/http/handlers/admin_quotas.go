package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type AdminQuotas struct{ q *db.Queries }

func NewAdminQuotas(q *db.Queries) *AdminQuotas { return &AdminQuotas{q: q} }

func (h *AdminQuotas) Get(w http.ResponseWriter, r *http.Request) {
	global, err := h.q.GetSetting(r.Context(), settingGlobalDailyQuota)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "get quota"))
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		global = "100"
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
		Limit int32 `json:"limit"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if req.Limit < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "limit must be >= 1"))
		return
	}
	if err := h.q.SetSetting(r.Context(), db.SetSettingParams{
		Key: settingGlobalDailyQuota, Value: strconv.Itoa(int(req.Limit)),
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set quota"))
		return
	}
	if err := h.q.SetAllKeyDailyLimits(r.Context(), req.Limit); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "propagate quota"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminQuotas) SetUserOverride(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
		Limit int32  `json:"limit"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	v := validate.Fields()
	v.Field("email", req.Email).Required()
	if err := v.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if req.Limit < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "limit must be >= 1"))
		return
	}
	user, err := h.q.GetUserByEmail(r.Context(), req.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "no user with that email"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "lookup user"))
		return
	}
	if err := h.q.SetUserQuotaOverride(r.Context(), db.SetUserQuotaOverrideParams{
		ID: user.ID, DailyQuotaOverride: &req.Limit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set override"))
		return
	}
	if err := h.q.SetUserKeyDailyLimit(r.Context(), db.SetUserKeyDailyLimitParams{
		UserID: user.ID, DailyLimit: req.Limit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "propagate override"))
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
	// Reset key limit to global quota
	global, err := h.q.GetSetting(r.Context(), settingGlobalDailyQuota)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "get global quota"))
		return
	}
	globalLimit := int32(100)
	if global != "" {
		if n, err := strconv.Atoi(global); err == nil {
			globalLimit = int32(n)
		}
	}
	if err := h.q.SetUserKeyDailyLimit(r.Context(), db.SetUserKeyDailyLimitParams{
		UserID: id, DailyLimit: globalLimit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "reset key limit"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
