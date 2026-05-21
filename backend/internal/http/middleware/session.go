package middleware

import (
	"context"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/store/db"
)

type ctxKey string

const sessionKey ctxKey = "session"

// LoadSession reads the cookie, looks up the session, and attaches it to
// the request context. It does NOT enforce auth — handlers do that via RequireSession.
// If the session owner is banned, it returns 403 immediately.
func LoadSession(s *auth.Sessions, q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(auth.CookieName)
			if err != nil || c.Value == "" {
				next.ServeHTTP(w, r)
				return
			}
			sess, ok, err := s.Load(r.Context(), c.Value)
			if err != nil || !ok {
				next.ServeHTTP(w, r)
				return
			}
			user, err := q.GetUserByID(r.Context(), sess.UserID)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			if user.Banned {
				apperr.Write(w, apperr.Forbidden("BANNED", "account suspended"))
				return
			}
			ctx := context.WithValue(r.Context(), sessionKey, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionFromContext returns the session attached by LoadSession, or false.
func SessionFromContext(ctx context.Context) (auth.Session, bool) {
	s, ok := ctx.Value(sessionKey).(auth.Session)
	return s, ok
}
