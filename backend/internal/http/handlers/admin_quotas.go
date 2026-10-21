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
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type AdminQuotas struct {
	q      *db.Queries
	rpmCfg *proxy.RpmConfig
}

func NewAdminQuotas(q *db.Queries, rpmCfg *proxy.RpmConfig) *AdminQuotas {
	return &AdminQuotas{q: q, rpmCfg: rpmCfg}
}

func (h *AdminQuotas) Get(w http.ResponseWriter, r *http.Request) {
	global, err := h.q.GetSetting(r.Context(), settingGlobalDailyQuota)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the daily limit; try again in a moment"))
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		global = strconv.Itoa(int(keys.DefaultDailyLimit))
	}
	rpm, err := h.q.GetSetting(r.Context(), settingGlobalRPM)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the per-minute limit; try again in a moment"))
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		rpm = "20"
	}
	slotsLimit, err := h.q.GetSetting(r.Context(), settingFreeTierLimit)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the free plan size; try again in a moment"))
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		slotsLimit = "25"
	}
	slotsUsed, err := h.q.CountFreeTierUsers(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't count free plan users; try again in a moment"))
		return
	}
	users, err := h.q.ListUsersAdmin(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the users; try again in a moment"))
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
	_ = json.NewEncoder(w).Encode(map[string]any{
		"globalLimit":    global,
		"globalRpmLimit": rpm,
		"overrides":      overrides,
		"slotsLimit":     slotsLimit,
		"slotsUsed":      slotsUsed,
	})
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
		apperr.Write(w, apperr.BadRequest("INVALID", "the limit must be 1 or more"))
		return
	}
	if err := h.q.SetSetting(r.Context(), db.SetSettingParams{
		Key: settingGlobalDailyQuota, Value: strconv.Itoa(int(req.Limit)),
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't save the daily limit; try again in a moment"))
		return
	}
	if err := h.q.SetAllKeyDailyLimits(r.Context(), req.Limit); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "the daily limit was saved, but existing keys weren't updated; try again in a moment"))
		return
	}
	mw.NoteAudit(r.Context(), "global daily quota", map[string]any{"limit": req.Limit})
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
		apperr.Write(w, apperr.BadRequest("INVALID", "the limit must be 1 or more"))
		return
	}
	user, err := h.q.GetUserByEmail(r.Context(), req.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "there's no user with that email"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't look up that user; try again in a moment"))
		return
	}
	if err := h.q.SetUserQuotaOverride(r.Context(), db.SetUserQuotaOverrideParams{
		ID: user.ID, DailyQuotaOverride: &req.Limit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't save the user's limit; try again in a moment"))
		return
	}
	if err := h.q.SetUserKeyDailyLimit(r.Context(), db.SetUserKeyDailyLimitParams{
		UserID: user.ID, DailyLimit: req.Limit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "the user's limit was saved, but their key wasn't updated; try again in a moment"))
		return
	}
	mw.NoteAudit(r.Context(), user.Email, map[string]any{"limit": req.Limit})
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminQuotas) RemoveUserOverride(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "that isn't a valid user id"))
		return
	}
	if err := h.q.RemoveUserQuotaOverride(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't remove the user's limit; try again in a moment"))
		return
	}
	// Reset key limit to global quota
	global, err := h.q.GetSetting(r.Context(), settingGlobalDailyQuota)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the daily limit; try again in a moment"))
		return
	}
	globalLimit := int32(keys.DefaultDailyLimit)
	if global != "" {
		if n, err := strconv.Atoi(global); err == nil {
			globalLimit = int32(n)
		}
	}
	if err := h.q.SetUserKeyDailyLimit(r.Context(), db.SetUserKeyDailyLimitParams{
		UserID: id, DailyLimit: globalLimit,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't reset the user's key to the global limit; try again in a moment"))
		return
	}
	target := id.String()
	if u, err := h.q.GetUserByID(r.Context(), id); err == nil {
		target = u.Email
	}
	mw.NoteAudit(r.Context(), target, map[string]any{"limit": globalLimit})
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminQuotas) SetGlobalRPM(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Limit int32 `json:"limit"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if req.Limit < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "the limit must be 1 or more"))
		return
	}
	if err := h.q.SetSetting(r.Context(), db.SetSettingParams{
		Key: settingGlobalRPM, Value: strconv.Itoa(int(req.Limit)),
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't save the per-minute limit; try again in a moment"))
		return
	}
	h.rpmCfg.Set(req.Limit)
	mw.NoteAudit(r.Context(), "global rpm", map[string]any{"limit": req.Limit})
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminQuotas) SetFreeTierLimit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Limit int32 `json:"limit"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if req.Limit < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "the limit must be 1 or more"))
		return
	}
	if err := h.q.SetSetting(r.Context(), db.SetSettingParams{
		Key: settingFreeTierLimit, Value: strconv.Itoa(int(req.Limit)),
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't save the free plan size; try again in a moment"))
		return
	}
	mw.NoteAudit(r.Context(), "free tier slots", map[string]any{"limit": req.Limit})
	w.WriteHeader(http.StatusNoContent)
}
