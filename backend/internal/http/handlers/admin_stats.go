package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

type AdminStats struct{ q *db.Queries }

func NewAdminStats(q *db.Queries) *AdminStats { return &AdminStats{q: q} }

func (h *AdminStats) Get(w http.ResponseWriter, r *http.Request) {
	daily, err := h.q.DailyRequestCounts(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "daily counts"))
		return
	}
	top, err := h.q.TopUsersByUsageThisMonth(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "top users"))
		return
	}
	total, _ := h.q.CountUsers(r.Context())
	active, _ := h.q.GetActiveProvider(r.Context())
	out := map[string]any{
		"totalUsers":     total,
		"activeProvider": active.Name,
		"daily":          daily,
		"topUsers":       top,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
