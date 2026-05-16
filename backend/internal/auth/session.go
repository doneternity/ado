package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"net/netip"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

const (
	CookieName = "ado_session"
	tokenBytes = 32
	csrfBytes  = 32
)

type Session struct {
	ID         []byte
	UserID     uuid.UUID
	CSRFToken  []byte
	ExpiresAt  time.Time
	LastSeenAt time.Time
}

type SessionConfig struct {
	IdleDays     int
	AbsoluteDays int
	CookieSecure bool
	CrossOrigin  bool
}

type Sessions struct {
	q   *db.Queries
	cfg SessionConfig
}

func NewSessions(q *db.Queries, cfg SessionConfig) *Sessions {
	return &Sessions{q: q, cfg: cfg}
}

func randomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	return b, err
}

// Create issues a fresh session and returns the cookie value (base64url(id)).
func (s *Sessions) Create(ctx context.Context, userID uuid.UUID, ua, ip string) (Session, string, error) {
	id, err := randomBytes(tokenBytes)
	if err != nil {
		return Session{}, "", err
	}
	csrf, err := randomBytes(csrfBytes)
	if err != nil {
		return Session{}, "", err
	}
	exp := time.Now().Add(time.Duration(s.cfg.AbsoluteDays) * 24 * time.Hour)

	var ipAddr *netip.Addr
	if parsed, parseErr := netip.ParseAddr(ip); parseErr == nil {
		ipAddr = &parsed
	}

	var uaPtr *string
	if ua != "" {
		uaPtr = &ua
	}

	row, err := s.q.CreateSession(ctx, db.CreateSessionParams{
		ID:        id,
		UserID:    userID,
		CsrfToken: csrf,
		ExpiresAt: pgtype.Timestamptz{Time: exp, Valid: true},
		UserAgent: uaPtr,
		Ip:        ipAddr,
	})
	if err != nil {
		return Session{}, "", err
	}

	cookieValue := base64.RawURLEncoding.EncodeToString(id)
	return Session{
		ID:         row.ID,
		UserID:     row.UserID,
		CSRFToken:  row.CsrfToken,
		ExpiresAt:  row.ExpiresAt.Time,
		LastSeenAt: row.LastSeenAt.Time,
	}, cookieValue, nil
}

// Load resolves a cookie value to a session. Returns (Session, true) on hit;
// (zero, false) if the cookie is missing/malformed/expired.
func (s *Sessions) Load(ctx context.Context, cookieValue string) (Session, bool, error) {
	id, err := base64.RawURLEncoding.DecodeString(cookieValue)
	if err != nil || len(id) != tokenBytes {
		return Session{}, false, nil
	}
	row, err := s.q.GetSession(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, false, nil
		}
		return Session{}, false, err
	}
	// Idle expiry check.
	idleCutoff := time.Now().Add(-time.Duration(s.cfg.IdleDays) * 24 * time.Hour)
	if row.LastSeenAt.Time.Before(idleCutoff) {
		_ = s.q.DeleteSession(ctx, id)
		return Session{}, false, nil
	}
	_ = s.q.TouchSession(ctx, id) // debounced server-side via WHERE clause
	return Session{
		ID:         row.ID,
		UserID:     row.UserID,
		CSRFToken:  row.CsrfToken,
		ExpiresAt:  row.ExpiresAt.Time,
		LastSeenAt: row.LastSeenAt.Time,
	}, true, nil
}

func (s *Sessions) Delete(ctx context.Context, id []byte) error {
	return s.q.DeleteSession(ctx, id)
}

func (s *Sessions) SetCookie(w http.ResponseWriter, value string) {
	sameSite := http.SameSiteLaxMode
	if s.cfg.CrossOrigin {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: sameSite,
		MaxAge:   s.cfg.AbsoluteDays * 24 * 3600,
	})
}

func (s *Sessions) ClearCookie(w http.ResponseWriter) {
	sameSite := http.SameSiteLaxMode
	if s.cfg.CrossOrigin {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: sameSite,
		MaxAge:   -1,
	})
}
