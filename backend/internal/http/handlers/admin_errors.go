package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

type AdminErrors struct{ q *db.Queries }

func NewAdminErrors(q *db.Queries) *AdminErrors { return &AdminErrors{q: q} }

func (h *AdminErrors) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	const perPage = 50
	rows, err := h.q.ListErrorLogs(r.Context(), db.ListErrorLogsParams{
		Limit:  perPage,
		Offset: int32((page - 1) * perPage),
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list errors"))
		return
	}
	total, _ := h.q.CountErrorLogs(r.Context())
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"logs": rows, "total": total, "page": page})
}

func (h *AdminErrors) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	if err := h.q.DeleteErrorLog(r.Context(), id); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminErrors) BulkDelete(w http.ResponseWriter, r *http.Request) {
	days, err := strconv.Atoi(r.URL.Query().Get("days"))
	if err != nil || days < 1 {
		apperr.Write(w, apperr.BadRequest("INVALID", "days must be a positive integer"))
		return
	}
	if err := h.q.DeleteOldErrorLogs(r.Context(), int32(days)); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "bulk delete"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
