package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type AdminUsers struct{ q *db.Queries }

func NewAdminUsers(q *db.Queries) *AdminUsers { return &AdminUsers{q: q} }

type adminUserDTO struct {
	ID                 uuid.UUID `json:"id"`
	Email              string    `json:"email"`
	DisplayName        *string   `json:"displayName"`
	Role               string    `json:"role"`
	Banned             bool      `json:"banned"`
	CreatedAt          time.Time `json:"createdAt"`
	DailyQuotaOverride *int32    `json:"dailyQuotaOverride"`
	PlanID             string    `json:"planId"`
	RequestsToday      int32     `json:"requestsToday"`
	// LastActive is the latest sign-in, session, or key use (same rule as the inactive cleanup).
	LastActive time.Time `json:"lastActive"`
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
			DisplayName:        u.DisplayName,
			Role:               u.Role,
			Banned:             u.Banned,
			CreatedAt:          u.CreatedAt.Time,
			DailyQuotaOverride: u.DailyQuotaOverride,
			PlanID:             u.PlanID,
			RequestsToday:      u.RequestsToday,
			LastActive:         u.LastActive.Time,
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
	if sess, ok := mw.SessionFromContext(r.Context()); ok && sess.UserID == id && req.Role != "admin" {
		apperr.Write(w, apperr.BadRequest("SELF_DEMOTE", "you cannot remove your own admin role"))
		return
	}
	if err := h.q.SetUserRole(r.Context(), db.SetUserRoleParams{ID: id, Role: req.Role}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set role"))
		return
	}
	h.noteUser(r, id, map[string]any{"role": req.Role})
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
	if sess, ok := mw.SessionFromContext(r.Context()); ok && sess.UserID == id && req.Banned {
		apperr.Write(w, apperr.BadRequest("SELF_BAN", "you cannot ban yourself"))
		return
	}
	if err := h.q.SetUserBanned(r.Context(), db.SetUserBannedParams{ID: id, Banned: req.Banned}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set banned"))
		return
	}
	h.noteUser(r, id, map[string]any{"banned": req.Banned})
	w.WriteHeader(http.StatusNoContent)
}

// Delete removes one account with its keys, sessions, usage and request logs
// (ON DELETE CASCADE). Admin accounts, including your own, can't be deleted
// here: demote first, so nobody locks the site out of its admin by accident.
func (h *AdminUsers) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	if sess, ok := mw.SessionFromContext(r.Context()); ok && sess.UserID == id {
		apperr.Write(w, apperr.BadRequest("SELF_DELETE", "you cannot delete your own account here"))
		return
	}
	u, err := h.q.GetUserByID(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "user not found"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load user"))
		return
	}
	if u.Role == "admin" {
		apperr.Write(w, apperr.BadRequest("IS_ADMIN", "demote this admin before deleting the account"))
		return
	}
	if err := h.q.DeleteUser(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete user"))
		return
	}
	slog.Info("admin deleted account", "user", id)
	mw.NoteAudit(r.Context(), u.Email, nil)
	w.WriteHeader(http.StatusNoContent)
}

// noteUser names the user (by email) in this request's audit log entry.
func (h *AdminUsers) noteUser(r *http.Request, id uuid.UUID, details map[string]any) {
	target := id.String()
	if u, err := h.q.GetUserByID(r.Context(), id); err == nil {
		target = u.Email
	}
	mw.NoteAudit(r.Context(), target, details)
}
