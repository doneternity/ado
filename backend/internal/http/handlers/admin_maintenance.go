package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
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

func (h *AdminMaintenance) Toggle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		// Fall back to toggling for backwards compatibility with clients that send no body.
		body.Enabled = !h.flag.Enabled()
	}
	h.flag.Set(body.Enabled)
	val := "false"
	if body.Enabled {
		val = "true"
	}
	_ = h.q.SetSetting(r.Context(), db.SetSettingParams{Key: "maintenance_mode", Value: val})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": body.Enabled})
}
