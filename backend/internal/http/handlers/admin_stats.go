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
	activeProviders, _ := h.q.CountActiveProviders(r.Context())

	type dailyRow struct {
		Day   string `json:"day"`
		Total int32  `json:"total"`
	}
	type topRow struct {
		Email string `json:"email"`
		Total int32  `json:"total"`
	}

	dailyOut := make([]dailyRow, 0, len(daily))
	for _, d := range daily {
		dailyOut = append(dailyOut, dailyRow{Day: d.Day.Time.Format("2006-01-02"), Total: d.Total})
	}
	topOut := make([]topRow, 0, len(top))
	for _, u := range top {
		topOut = append(topOut, topRow{Email: u.Email, Total: u.Total})
	}

	out := map[string]any{
		"totalUsers":      total,
		"activeProviders": activeProviders,
		"daily":           dailyOut,
		"topUsers":        topOut,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
