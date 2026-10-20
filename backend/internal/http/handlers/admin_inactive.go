package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

// MinInactiveDays is the shortest inactivity the cleanup accepts, so an
// account in active use can never be swept up by mistake. The privacy policy
// only says unused accounts may be removed.
const MinInactiveDays = 150

type inactiveUserDTO struct {
	ID         uuid.UUID `json:"id"`
	Email      string    `json:"email"`
	CreatedAt  time.Time `json:"createdAt"`
	LastActive time.Time `json:"lastActive"`
}

func inactiveCutoff(days int) (pgtype.Timestamptz, bool) {
	if days < MinInactiveDays || days > 3650 {
		return pgtype.Timestamptz{}, false
	}
	return pgtype.Timestamptz{Time: time.Now().Add(-time.Duration(days) * 24 * time.Hour), Valid: true}, true
}

// Inactive previews the accounts the cleanup would delete: no sign-in, session
// or API activity for ?days= days. Admins, banned and paid users never appear.
func (h *AdminUsers) Inactive(w http.ResponseWriter, r *http.Request) {
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	cutoff, ok := inactiveCutoff(days)
	if !ok {
		apperr.Write(w, apperr.BadRequest("INVALID", "days must be at least "+strconv.Itoa(MinInactiveDays)))
		return
	}
	rows, err := h.q.ListInactiveUsers(r.Context(), cutoff)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list inactive users"))
		return
	}
	out := make([]inactiveUserDTO, len(rows))
	for i, u := range rows {
		out[i] = inactiveUserDTO{ID: u.ID, Email: u.Email, CreatedAt: u.CreatedAt.Time, LastActive: u.LastActive.Time}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"days": days, "users": out})
}

// DeleteInactive deletes the previewed accounts (by id), skipping any that
// became active since the preview. Their keys, sessions, usage and request
// logs are deleted with them.
func (h *AdminUsers) DeleteInactive(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Days int         `json:"days"`
		IDs  []uuid.UUID `json:"ids"`
	}
	if err := validate.Bind(r, &req, validate.MaxBytes(1<<20)); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	cutoff, ok := inactiveCutoff(req.Days)
	if !ok {
		apperr.Write(w, apperr.BadRequest("INVALID", "days must be at least "+strconv.Itoa(MinInactiveDays)))
		return
	}
	if len(req.IDs) == 0 || len(req.IDs) > 10000 {
		apperr.Write(w, apperr.BadRequest("INVALID", "send between 1 and 10000 ids"))
		return
	}
	n, err := h.q.DeleteInactiveUsers(r.Context(), db.DeleteInactiveUsersParams{Ids: req.IDs, Cutoff: cutoff})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete inactive users"))
		return
	}
	slog.Info("deleted inactive accounts", "count", n, "requested", len(req.IDs), "inactive_days", req.Days)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]int64{"deleted": n})
}
