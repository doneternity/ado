package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/config"
	"github.com/ado/ado/backend/internal/mailer"
	"github.com/ado/ado/backend/internal/store/db"
)

type AuthDeps struct {
	Cfg      *config.Config
	Q        *db.Queries
	Sessions *auth.Sessions
	Verifier *auth.Verifier
	Mailer   mailer.Mailer
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
		EmailVerified: false,
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

	rawTok, err := a.d.Verifier.Issue(r.Context(), user.ID)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "issue token"))
		return
	}
	link := a.d.Cfg.AppBaseURL + "/verify?token=" + rawTok
	if err := a.d.Mailer.SendVerification(r.Context(), user.Email, link); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "send email"))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"needsVerification": true,
		"email":             user.Email,
	})
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
