package middleware

import (
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

// RequireAdmin gates a route to users with role='admin'.
// It re-fetches the user from DB so role changes take effect immediately.
func RequireAdmin(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := SessionFromContext(r.Context())
			if !ok {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
				return
			}
			user, err := q.GetUserByID(r.Context(), sess.UserID)
			if err != nil || user.Role != "admin" {
				apperr.Write(w, apperr.Forbidden("FORBIDDEN", "admin only"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
