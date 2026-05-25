package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

type SlotsHandler struct{ q *db.Queries }

func NewSlots(q *db.Queries) *SlotsHandler { return &SlotsHandler{q: q} }

func (h *SlotsHandler) Get(w http.ResponseWriter, r *http.Request) {
	limit := int32(25)
	v, err := h.q.GetSetting(r.Context(), settingFreeTierLimit)
	if err == nil {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = int32(n)
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.Internal("INTERNAL", "get setting"))
		return
	}

	used, err := h.q.CountFreeTierUsers(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "count users"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"full":  used >= limit,
		"used":  used,
		"limit": limit,
	})
}
