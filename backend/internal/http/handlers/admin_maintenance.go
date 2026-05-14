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
	next := !h.flag.Enabled()
	h.flag.Set(next)
	val := "false"
	if next {
		val = "true"
	}
	_ = h.q.SetSetting(r.Context(), db.SetSettingParams{Key: "maintenance_mode", Value: val})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": next})
}
