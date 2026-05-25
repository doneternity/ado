package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/auth"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/store/db"
)

type AuthDeps struct {
	Q        *db.Queries
	Sessions *auth.Sessions
}

type Auth struct{ d AuthDeps }

func NewAuth(d AuthDeps) *Auth { return &Auth{d: d} }

func (a *Auth) Me(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	user, err := a.d.Q.GetUserByID(r.Context(), sess.UserID)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load user"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"user":      userDTO(user),
		"csrfToken": base64URL(sess.CSRFToken),
	})
}

func (a *Auth) DeleteMe(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	if err := a.d.Q.DeleteUser(r.Context(), sess.UserID); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "delete user"))
		return
	}
	a.d.Sessions.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		if id, derr := base64URLDecode(c.Value); derr == nil {
			_ = a.d.Sessions.Delete(r.Context(), id)
		}
	}
	a.d.Sessions.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func ptr[T any](v T) *T {
	if any(v) == any(*new(T)) {
		return nil
	}
	return &v
}

func userDTO(u db.User) map[string]any {
	out := map[string]any{
		"id":            u.ID.String(),
		"email":         u.Email,
		"emailVerified": u.EmailVerified,
		"role":          u.Role,
	}
	if u.DisplayName != nil {
		out["displayName"] = *u.DisplayName
	}
	if u.PhotoUrl != nil {
		out["photoUrl"] = *u.PhotoUrl
	}
	return out
}

func base64URL(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func base64URLDecode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}
