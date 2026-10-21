package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/store/db"
)

// Views over request_log: recent requests and per-model totals for admins,
// and a per-model breakdown of a user's own usage for the dashboard.
type UsageLog struct{ q *db.Queries }

func NewUsageLog(q *db.Queries) *UsageLog { return &UsageLog{q: q} }

type requestDTO struct {
	ID               int64     `json:"id"`
	CreatedAt        time.Time `json:"createdAt"`
	Email            string    `json:"email"`
	Endpoint         string    `json:"endpoint"`
	Model            *string   `json:"model"`
	Status           int32     `json:"status"`
	DurationMs       int32     `json:"durationMs"`
	Stream           bool      `json:"stream"`
	Provider         *string   `json:"provider"`
	PromptTokens     *int32    `json:"promptTokens"`
	CompletionTokens *int32    `json:"completionTokens"`
}

type modelUsageDTO struct {
	Model            string `json:"model"`
	Requests         int32  `json:"requests"`
	OK               int32  `json:"ok"`
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	AvgMs            *int32 `json:"avgMs,omitempty"`
}

// intParam reads a positive int query param, clamped to [1, max].
func intParam(r *http.Request, name string, def, max int) int {
	n, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || n < 1 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func since(days int) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, -days), Valid: true}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// AdminRecent: GET /api/admin/requests?email=&limit=
func (h *UsageLog) AdminRecent(w http.ResponseWriter, r *http.Request) {
	var email *string
	if e := strings.TrimSpace(r.URL.Query().Get("email")); e != "" {
		e = strings.ToLower(e)
		email = &e
	}
	rows, err := h.q.ListRecentRequests(r.Context(), db.ListRecentRequestsParams{
		Email: email, RowLimit: int32(intParam(r, "limit", 100, 500)),
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the request log; try again in a moment"))
		return
	}
	out := make([]requestDTO, len(rows))
	for i, x := range rows {
		out[i] = requestDTO{
			ID: x.ID, CreatedAt: x.CreatedAt.Time, Email: x.Email, Endpoint: x.Endpoint, Model: x.Model,
			Status: x.Status, DurationMs: x.DurationMs, Stream: x.Stream, Provider: x.Provider,
			PromptTokens: x.PromptTokens, CompletionTokens: x.CompletionTokens,
		}
	}
	writeJSON(w, out)
}

// AdminByModel: GET /api/admin/usage/models?days=
func (h *UsageLog) AdminByModel(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.UsageByModel(r.Context(), since(intParam(r, "days", 7, 90)))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load usage by model; try again in a moment"))
		return
	}
	out := make([]modelUsageDTO, len(rows))
	for i, x := range rows {
		avg := x.AvgMs
		out[i] = modelUsageDTO{Model: x.Model, Requests: x.Requests, OK: x.Ok,
			PromptTokens: x.PromptTokens, CompletionTokens: x.CompletionTokens, AvgMs: &avg}
	}
	writeJSON(w, out)
}

// MineByModel: GET /api/keys/usage/models?days= (signed-in user's own usage)
func (h *UsageLog) MineByModel(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "you're signed out: sign in again"))
		return
	}
	rows, err := h.q.UserUsageByModel(r.Context(), db.UserUsageByModelParams{
		UserID: sess.UserID, Since: since(intParam(r, "days", 30, 90)),
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load usage by model; try again in a moment"))
		return
	}
	out := make([]modelUsageDTO, len(rows))
	for i, x := range rows {
		out[i] = modelUsageDTO{Model: x.Model, Requests: x.Requests, OK: x.Ok,
			PromptTokens: x.PromptTokens, CompletionTokens: x.CompletionTokens}
	}
	writeJSON(w, out)
}
