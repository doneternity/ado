package middleware

import (
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

// MaintenanceGate returns 503 MAINTENANCE while maintenance mode is on, except
// for signed-in admins, who keep full access so they can work on the site.
func MaintenanceGate(flag interface{ Enabled() bool }, q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !flag.Enabled() {
				next.ServeHTTP(w, r)
				return
			}
			if sess, ok := SessionFromContext(r.Context()); ok {
				if user, err := q.GetUserByID(r.Context(), sess.UserID); err == nil && user.Role == "admin" {
					next.ServeHTTP(w, r)
					return
				}
			}
			apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		})
	}
}
