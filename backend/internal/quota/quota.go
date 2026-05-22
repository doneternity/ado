package quota

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/store/db"
)

type Service struct{ q *db.Queries }

func NewService(q *db.Queries) *Service { return &Service{q: q} }

var ErrExceeded = errors.New("daily quota exceeded")

// Charge atomically increments the daily counter if under limit.
// Returns the new used value, or ErrExceeded if the limit is already reached.
func (s *Service) Charge(ctx context.Context, keyID uuid.UUID, dailyLimit int32) (int32, error) {
	used, err := s.q.IncrementUsage(ctx, db.IncrementUsageParams{
		KeyID:      keyID,
		DailyLimit: dailyLimit,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrExceeded
	}
	if err != nil {
		return 0, err
	}
	return used, nil
}

// Refund returns one charged unit to the daily counter.
func (s *Service) Refund(ctx context.Context, keyID uuid.UUID) error {
	return s.q.DecrementUsage(ctx, keyID)
}
