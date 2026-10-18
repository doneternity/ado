package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

// Plans group users under shared limits. A nil limit means "use the global
// setting", so the seeded free plan follows the global quota and RPM.
type AdminPlans struct{ q *db.Queries }

func NewAdminPlans(q *db.Queries) *AdminPlans { return &AdminPlans{q: q} }

var planIDPattern = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

type planDTO struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	DailyQuota *int32    `json:"dailyQuota"`
	RPM        *int32    `json:"rpm"`
	UserCount  int32     `json:"userCount"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (h *AdminPlans) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListPlansWithUserCounts(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list plans"))
		return
	}
	out := make([]planDTO, len(rows))
	for i, p := range rows {
		out[i] = planDTO{ID: p.ID, Name: p.Name, DailyQuota: p.DailyQuota, RPM: p.Rpm, UserCount: p.UserCount, CreatedAt: p.CreatedAt.Time}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// Upsert creates or updates the plan with the id in the URL.
func (h *AdminPlans) Upsert(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !planIDPattern.MatchString(id) {
		apperr.Write(w, apperr.BadRequest("INVALID", "plan id must be 1-32 lowercase letters, digits or dashes"))
		return
	}
	var req struct {
		Name       string `json:"name"`
		DailyQuota *int32 `json:"dailyQuota"`
		RPM        *int32 `json:"rpm"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	v := validate.Fields()
	v.Field("name", req.Name).Required().MaxLen(64)
	if err := v.Err(); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if (req.DailyQuota != nil && *req.DailyQuota <= 0) || (req.RPM != nil && *req.RPM <= 0) {
		apperr.Write(w, apperr.BadRequest("INVALID", "limits must be positive, or null to use the global setting"))
		return
	}
	p, err := h.q.UpsertPlan(r.Context(), db.UpsertPlanParams{ID: id, Name: req.Name, DailyQuota: req.DailyQuota, Rpm: req.RPM})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "save plan"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(planDTO{ID: p.ID, Name: p.Name, DailyQuota: p.DailyQuota, RPM: p.Rpm, CreatedAt: p.CreatedAt.Time})
}

// Delete removes a plan nobody is on. The free plan can't be deleted.
func (h *AdminPlans) Delete(w http.ResponseWriter, r *http.Request) {
	n, err := h.q.DeleteUnusedPlan(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete plan"))
		return
	}
	if n == 0 {
		apperr.Write(w, apperr.Conflict("PLAN_IN_USE", "plan not found, still has users, or is the free plan"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SetUserPlan moves a user onto a plan.
func (h *AdminPlans) SetUserPlan(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", "invalid id"))
		return
	}
	var req struct {
		PlanID string `json:"planId"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	n, err := h.q.SetUserPlan(r.Context(), db.SetUserPlanParams{ID: id, PlanID: req.PlanID})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" { // foreign key: no such plan
		apperr.Write(w, apperr.BadRequest("UNKNOWN_PLAN", "no plan with that id"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set plan"))
		return
	}
	if n == 0 {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "user not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
