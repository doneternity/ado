package keys

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/ado/ado/backend/internal/store/db"
)

const DefaultDailyLimit = 100

type Service struct {
	q    *db.Queries
	pool *pgxpool.Pool
	rdb  *redis.Client
}

func NewService(q *db.Queries, pool *pgxpool.Pool, rdb *redis.Client) *Service {
	return &Service{q: q, pool: pool, rdb: rdb}
}

type Issued struct {
	Raw        string
	Prefix     string
	DailyLimit int32
}

// EnsureForUser issues a key only if the user has no active key.
// Returns Issued{} (Raw=="") if the user already had one.
func (s *Service) EnsureForUser(ctx context.Context, userID uuid.UUID) (Issued, error) {
	if _, err := s.q.GetActiveKeyByUser(ctx, userID); err == nil {
		return Issued{}, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Issued{}, err
	}
	raw, prefix, hash, err := Generate()
	if err != nil {
		return Issued{}, err
	}
	row, err := s.q.CreateAdoKey(ctx, db.CreateAdoKeyParams{
		UserID:     userID,
		KeyPrefix:  prefix,
		KeyHash:    hash,
		DailyLimit: s.defaultLimit(ctx),
	})
	if err != nil {
		return Issued{}, err
	}
	return Issued{Raw: raw, Prefix: row.KeyPrefix, DailyLimit: row.DailyLimit}, nil
}

// Rotate revokes the active key and issues a new one, moving today's usage
// over so rotating can't reset the quota. all in one tx: a partial failure
// rolls back, so the user is never left keyless.
func (s *Service) Rotate(ctx context.Context, userID uuid.UUID) (Issued, error) {
	limit := s.defaultLimit(ctx)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Issued{}, err
	}
	defer tx.Rollback(ctx)
	qtx := s.q.WithTx(tx)

	// fetch the old key so we can carry its usage over.
	oldKey, err := qtx.GetActiveKeyByUser(ctx, userID)
	hadOld := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Issued{}, err
	}

	if err := qtx.RevokeActiveKeyForUser(ctx, userID); err != nil {
		return Issued{}, err
	}
	raw, prefix, hash, err := Generate()
	if err != nil {
		return Issued{}, err
	}
	row, err := qtx.CreateAdoKey(ctx, db.CreateAdoKeyParams{
		UserID:     userID,
		KeyPrefix:  prefix,
		KeyHash:    hash,
		DailyLimit: limit,
	})
	if err != nil {
		return Issued{}, err
	}

	// move today's usage to the new key so rotating can't reset the quota
	// (and so admin totals don't double-count it).
	if hadOld {
		if err := qtx.CarryUsageToNewKey(ctx, db.CarryUsageToNewKeyParams{
			KeyID:   oldKey.ID,
			KeyID_2: row.ID,
		}); err != nil {
			return Issued{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Issued{}, err
	}
	return Issued{Raw: raw, Prefix: row.KeyPrefix, DailyLimit: row.DailyLimit}, nil
}

func (s *Service) defaultLimit(ctx context.Context) int32 {
	v, err := s.q.GetSetting(ctx, "global_daily_quota")
	if err != nil {
		return DefaultDailyLimit
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return DefaultDailyLimit
	}
	return int32(n)
}

// StashFlash stores a newly-issued raw key in Redis for one-shot retrieval after OAuth redirect.
func (s *Service) StashFlash(ctx context.Context, sessionIDHex, raw, prefix string, dailyLimit int32) error {
	val := raw + "|" + prefix + "|" + strconv.Itoa(int(dailyLimit))
	return s.rdb.Set(ctx, "flash:newkey:"+sessionIDHex, val, 5*time.Minute).Err()
}

// PopFlash returns the stashed key (or empty Issued) and deletes it atomically.
func (s *Service) PopFlash(ctx context.Context, sessionIDHex string) (Issued, error) {
	v, err := s.rdb.GetDel(ctx, "flash:newkey:"+sessionIDHex).Result()
	if errors.Is(err, redis.Nil) {
		return Issued{}, nil
	}
	if err != nil {
		return Issued{}, err
	}
	parts := strings.SplitN(v, "|", 3)
	if len(parts) != 3 {
		return Issued{}, nil
	}
	limit, err := strconv.Atoi(parts[2])
	if err != nil {
		return Issued{}, nil
	}
	return Issued{Raw: parts[0], Prefix: parts[1], DailyLimit: int32(limit)}, nil
}
