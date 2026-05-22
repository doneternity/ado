package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
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

func (h *AdminMaintenance) Toggle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := validate.Bind(r, &body); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	h.flag.Set(body.Enabled)
	val := "false"
	if body.Enabled {
		val = "true"
	}
	_ = h.q.SetSetting(r.Context(), db.SetSettingParams{Key: settingMaintenanceMode, Value: val})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"enabled": body.Enabled})
}
