package handlers

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

// ClientErrors receives crash reports from the website (frontend/src/api/
// reportError.ts) and stores them in error_logs next to server 5xx errors, so
// Admin > Errors and the spike alert see both.
//
// It's public, so it stores as little as possible: the error message, the
// stack trace (our own code's file names and line numbers), and the page path
// without its query string. No IP, user, or browser details.
type ClientErrors struct {
	q       *db.Queries
	limiter *mw.Limiter
}

func NewClientErrors(q *db.Queries, limiter *mw.Limiter) *ClientErrors {
	return &ClientErrors{q: q, limiter: limiter}
}

// Caps on what one report can store, and on reports from everyone together
// (the per-IP limit is on the route), so the endpoint can't flood the table.
const (
	clientErrMaxMessage = 300
	clientErrMaxStack   = 4000
	clientErrGlobalHour = 300
)

type clientErrorReq struct {
	Kind    string `json:"kind"`
	Message string `json:"message"`
	Stack   string `json:"stack"`
	Page    string `json:"page"`
}

func (h *ClientErrors) Report(w http.ResponseWriter, r *http.Request) {
	var req clientErrorReq
	if err := validate.Bind(r, &req, validate.MaxBytes(16<<10)); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	msg := clip(strings.TrimSpace(req.Message), clientErrMaxMessage)
	if msg == "" {
		apperr.Write(w, apperr.BadRequest("INVALID", "message is required"))
		return
	}
	if ok, _, err := h.limiter.Check(r.Context(), "rl:client-errors:all", clientErrGlobalHour, time.Hour); err == nil && !ok {
		w.WriteHeader(http.StatusNoContent) // drop quietly; the browser has nothing to retry
		return
	}

	kind := req.Kind
	switch kind {
	case "render", "error", "promise":
	default:
		kind = "error"
	}
	raw, _ := json.Marshal(map[string]string{
		"source": "frontend",
		"kind":   kind,
		"page":   pagePath(req.Page),
		"stack":  clip(req.Stack, clientErrMaxStack),
	})
	if err := h.q.InsertErrorLog(r.Context(), db.InsertErrorLogParams{
		Level:   "error",
		Message: "website: " + msg,
		Context: raw,
	}); err != nil {
		slog.Warn("client error insert failed", "err", err)
		apperr.Write(w, apperr.Internal("INTERNAL", "could not save report"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// pagePath keeps only the path of the page the error happened on. Query
// strings and fragments can carry things we don't want to store.
func pagePath(page string) string {
	u, err := url.Parse(page)
	if err != nil {
		return ""
	}
	return clip(u.Path, 200)
}

func clip(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}
