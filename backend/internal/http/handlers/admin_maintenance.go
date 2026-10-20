package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type AdminMaintenance struct {
	q    *db.Queries
	flag *proxy.MaintenanceFlag
}

func NewAdminMaintenance(q *db.Queries, flag *proxy.MaintenanceFlag) *AdminMaintenance {
	return &AdminMaintenance{q: q, flag: flag}
}

func (h *AdminMaintenance) Get(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": h.flag.Enabled()})
}

// Status is the public read of the flag, so the website can show its
// maintenance page. It reveals nothing beyond on/off.
func (h *AdminMaintenance) Status(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": h.flag.Enabled()})
}

func (h *AdminMaintenance) Toggle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := validate.Bind(r, &body); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	wasOn := h.flag.Enabled()
	h.flag.Set(body.Enabled)
	// Nobody could use their key during maintenance, so don't let that time count
	// as idle: keep the reaper paused for a full idle period after reopening.
	if wasOn && !body.Enabled {
		until := time.Now().Add(KeyIdleLimit).UTC().Format(time.RFC3339)
		if err := h.q.SetSetting(r.Context(), db.SetSettingParams{Key: settingReaperGraceUntil, Value: until}); err != nil {
			slog.Warn("set reaper grace", "err", err)
		}
	}
	val := "false"
	if body.Enabled {
		val = "true"
	}
	_ = h.q.SetSetting(r.Context(), db.SetSettingParams{Key: settingMaintenanceMode, Value: val})
	mw.NoteAudit(r.Context(), "maintenance mode", map[string]any{"enabled": body.Enabled})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": body.Enabled})
}

// KeyIdleLimit is how long a free-plan key can go unused before the reaper
// revokes it to free up its slot.
const KeyIdleLimit = 14 * 24 * time.Hour

// ReapInactiveKeys revokes idle free-plan keys. It does nothing while
// maintenance mode is on (keys can't be used then) or during the grace period
// after it ends, so a closure never costs users their keys.
func ReapInactiveKeys(ctx context.Context, q *db.Queries, flag *proxy.MaintenanceFlag) {
	if flag.Enabled() {
		return
	}
	if v, err := q.GetSetting(ctx, settingReaperGraceUntil); err == nil {
		if until, perr := time.Parse(time.RFC3339, v); perr == nil && time.Now().Before(until) {
			return
		}
	}
	cutoff := pgtype.Timestamptz{Time: time.Now().Add(-KeyIdleLimit), Valid: true}
	if err := q.RevokeInactiveKeys(ctx, cutoff); err != nil {
		slog.Warn("revoke inactive keys", "err", err)
	}
}
