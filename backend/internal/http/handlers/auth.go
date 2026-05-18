package handlers

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/redis/go-redis/v9"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/config"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/mailer"
	"github.com/ado/ado/backend/internal/store/db"
)

type AuthDeps struct {
	Cfg      *config.Config
	Q        *db.Queries
	Sessions *auth.Sessions
	Verifier *auth.Verifier
	Mailer   mailer.Mailer
	Keys     *keys.Service
}

type Auth struct{ d AuthDeps }

func NewAuth(d AuthDeps) *Auth { return &Auth{d: d} }

type signupReq struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

func (a *Auth) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "malformed JSON"))
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if !validEmail(req.Email) {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "invalid email"))
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 128 {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "password must be 8-128 chars"))
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "hash failed"))
		return
	}

	role := "user"
	if a.d.Cfg.AdminBootstrapEmail != "" && req.Email == strings.ToLower(a.d.Cfg.AdminBootstrapEmail) {
		role = "admin"
	}

	user, err := a.d.Q.CreateUser(r.Context(), db.CreateUserParams{
		Email:         req.Email,
		EmailVerified: true,
		PasswordHash:  ptr(hash),
		GoogleSub:     nil,
		DisplayName:   ptr(strings.TrimSpace(req.DisplayName)),
		PhotoUrl:      nil,
		Role:          role,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			apperr.Write(w, apperr.Conflict("EMAIL_TAKEN", "email already in use"))
			return
		}
		apperr.Write(w, apperr.Internal("INTERNAL", "could not create user"))
		return
	}

	sess, cookie, err := a.d.Sessions.Create(r.Context(), user.ID, r.UserAgent(), mw.ClientIP(r))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create session"))
		return
	}
	a.d.Sessions.SetCookie(w, cookie)

	resp := map[string]any{
		"user":      userDTO(user),
		"csrfToken": base64URL(sess.CSRFToken),
	}
	if issued, _ := a.d.Keys.EnsureForUser(r.Context(), user.ID); issued.Raw != "" {
		resp["keyJustIssued"] = map[string]any{
			"key":        issued.Raw,
			"keyPrefix":  issued.Prefix,
			"dailyLimit": issued.DailyLimit,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

// ptr returns nil for the zero value of T, otherwise &v.
func ptr[T any](v T) *T {
	if any(v) == any(*new(T)) {
		return nil
	}
	return &v
}

func validEmail(s string) bool {
	if !strings.Contains(s, "@") || len(s) > 254 || len(s) < 3 {
		return false
	}
	at := strings.LastIndex(s, "@")
	return at > 0 && at < len(s)-1 && !strings.Contains(s, " ")
}

type verifyReq struct {
	Token string `json:"token"`
}

func (a *Auth) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "missing token"))
		return
	}
	userID, err := a.d.Verifier.Claim(r.Context(), req.Token)
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID_TOKEN", "token invalid or expired"))
		return
	}
	if err := a.d.Q.SetEmailVerified(r.Context(), userID); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "verify"))
		return
	}
	user, err := a.d.Q.GetUserByID(r.Context(), userID)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load user"))
		return
	}

	sess, cookie, err := a.d.Sessions.Create(r.Context(), userID, r.UserAgent(), mw.ClientIP(r))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create session"))
		return
	}
	a.d.Sessions.SetCookie(w, cookie)

	resp := map[string]any{
		"user":      userDTO(user),
		"csrfToken": base64URL(sess.CSRFToken),
	}
	if issued, _ := a.d.Keys.EnsureForUser(r.Context(), user.ID); issued.Raw != "" {
		resp["keyJustIssued"] = map[string]any{
			"key":        issued.Raw,
			"keyPrefix":  issued.Prefix,
			"dailyLimit": issued.DailyLimit,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

type resendReq struct {
	Email string `json:"email"`
}

func (a *Auth) ResendVerify(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req resendReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "missing email"))
			return
		}
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))

		// 60s cooldown per email (NX fails if key exists).
		set, err := rdb.SetNX(r.Context(), "verify_cd:"+req.Email, 1, 60*time.Second).Result()
		if err == nil && !set {
			ttl, _ := rdb.TTL(r.Context(), "verify_cd:"+req.Email).Result()
			apperr.Write(w, apperr.TooMany("COOLDOWN", "wait before resending").
				WithExtra("retryAfter", int(ttl.Seconds())))
			return
		}

		// Always 200 to avoid email enumeration. Only do work if user exists + unverified.
		user, err := a.d.Q.GetUserByEmail(r.Context(), req.Email)
		if err == nil && !user.EmailVerified {
			_ = a.d.Verifier.Reset(r.Context(), user.ID)
			rawTok, ierr := a.d.Verifier.Issue(r.Context(), user.ID)
			if ierr == nil {
				_ = a.d.Mailer.SendVerification(r.Context(), user.Email,
					a.d.Cfg.AppBaseURL+"/verify?token="+rawTok)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}
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

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "malformed JSON"))
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Generic error to avoid leaking which part was wrong (email vs password).
	user, err := a.d.Q.GetUserByEmail(r.Context(), req.Email)
	if err != nil || user.PasswordHash == nil || !auth.VerifyPassword(req.Password, *user.PasswordHash) {
		apperr.Write(w, apperr.Unauthorized("INVALID_CREDENTIALS", "invalid email or password"))
		return
	}
	if user.Banned {
		apperr.Write(w, apperr.Forbidden("BANNED", "account suspended"))
		return
	}

	sess, cookie, err := a.d.Sessions.Create(r.Context(), user.ID, r.UserAgent(), mw.ClientIP(r))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "create session"))
		return
	}
	a.d.Sessions.SetCookie(w, cookie)

	resp := map[string]any{
		"user":      userDTO(user),
		"csrfToken": base64URL(sess.CSRFToken),
	}
	if issued, _ := a.d.Keys.EnsureForUser(r.Context(), user.ID); issued.Raw != "" {
		resp["keyJustIssued"] = map[string]any{
			"key":        issued.Raw,
			"keyPrefix":  issued.Prefix,
			"dailyLimit": issued.DailyLimit,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
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
