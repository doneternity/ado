package middleware

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

// AuditNote is what an admin handler says about a change beyond its route:
// a readable target (a provider's name, a user's email) and details such as
// the new value. Handlers fill it via AuditNoteFrom; Audit writes it out.
// Never put secrets in it: it is stored as is.
type AuditNote struct {
	Target  string
	Details map[string]any
}

type auditNoteKey struct{}

// AuditNoteFrom returns the note for this request, or nil outside Audit.
func AuditNoteFrom(ctx context.Context) *AuditNote {
	n, _ := ctx.Value(auditNoteKey{}).(*AuditNote)
	return n
}

// NoteAudit sets the target and adds details, if the request is audited.
func NoteAudit(ctx context.Context, target string, details map[string]any) {
	n := AuditNoteFrom(ctx)
	if n == nil {
		return
	}
	if target != "" {
		n.Target = target
	}
	for k, v := range details {
		n.Details[k] = v
	}
}

// Audit records every successful change made through the admin API (any
// request other than GET, HEAD or OPTIONS that ends in a 2xx) in
// admin_audit_log: who, which route, its URL parameters, and the handler's
// note. Request bodies are never stored, since some carry provider API keys.
// It must run after the admin check, so only admins reach it. A failed insert
// only logs a warning; the change itself has already happened.
func Audit(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			note := &AuditNote{Details: map[string]any{}}
			rec := &statusRecorder{ResponseWriter: w}
			next.ServeHTTP(rec, r.WithContext(context.WithValue(r.Context(), auditNoteKey{}, note)))

			status := rec.status
			if status == 0 {
				status = http.StatusOK
			}
			if status < 200 || status > 299 {
				return
			}

			details := note.Details
			if rctx := chi.RouteContext(r.Context()); rctx != nil {
				for i, k := range rctx.URLParams.Keys {
					if k != "*" && i < len(rctx.URLParams.Values) {
						if _, set := details[k]; !set {
							details[k] = rctx.URLParams.Values[i]
						}
					}
				}
			}
			action := r.Method + " " + strings.TrimPrefix(routePattern(r), "/api/admin")

			var actorID pgtype.UUID
			label := "unknown"
			if s, ok := SessionFromContext(r.Context()); ok {
				actorID = pgtype.UUID{Bytes: s.UserID, Valid: true}
				label = s.UserID.String()
				if u, err := q.GetUserByID(r.Context(), s.UserID); err == nil {
					label = u.Email
				}
			}
			raw, err := json.Marshal(details)
			if err != nil {
				raw = []byte("{}")
			}
			if err := q.InsertAuditLog(context.WithoutCancel(r.Context()), db.InsertAuditLogParams{
				ActorID: actorID, ActorLabel: label, Action: action, Target: note.Target, Details: raw,
			}); err != nil {
				slog.Warn("audit log insert failed", "action", action, "err", err)
			}
		})
	}
}

// routePattern is the matched route (e.g. /api/admin/providers/{id}), or the
// raw path when chi has none.
func routePattern(r *http.Request) string {
	if rctx := chi.RouteContext(r.Context()); rctx != nil {
		if p := rctx.RoutePattern(); p != "" {
			return p
		}
	}
	return r.URL.Path
}
