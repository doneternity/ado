package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

type Verifier struct{ q *db.Queries }

func NewVerifier(q *db.Queries) *Verifier { return &Verifier{q: q} }

const verifyTokenBytes = 32
const verifyTTL = 24 * time.Hour

// Issue creates a token for the user. Returns the raw (un-hashed) token,
// to be embedded in the email link.
func (v *Verifier) Issue(ctx context.Context, userID uuid.UUID) (string, error) {
	raw := make([]byte, verifyTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	hash := sha256.Sum256(raw)
	if err := v.q.CreateEmailVerificationToken(ctx, db.CreateEmailVerificationTokenParams{
		TokenHash: hash[:],
		UserID:    userID,
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(verifyTTL), Valid: true},
	}); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

var ErrTokenInvalid = errors.New("token invalid or expired")

// Claim consumes the token and returns the user_id.
func (v *Verifier) Claim(ctx context.Context, rawHex string) (uuid.UUID, error) {
	raw, err := hex.DecodeString(rawHex)
	if err != nil || len(raw) != verifyTokenBytes {
		return uuid.Nil, ErrTokenInvalid
	}
	hash := sha256.Sum256(raw)
	row, err := v.q.GetEmailVerificationToken(ctx, hash[:])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrTokenInvalid
		}
		return uuid.Nil, err
	}
	if row.ConsumedAt.Valid || row.ExpiresAt.Time.Before(time.Now()) {
		return uuid.Nil, ErrTokenInvalid
	}
	if err := v.q.ConsumeEmailVerificationToken(ctx, hash[:]); err != nil {
		return uuid.Nil, err
	}
	return row.UserID, nil
}

// Reset deletes any outstanding tokens for the user (for resend).
func (v *Verifier) Reset(ctx context.Context, userID uuid.UUID) error {
	return v.q.DeleteEmailVerificationTokensForUser(ctx, userID)
}
