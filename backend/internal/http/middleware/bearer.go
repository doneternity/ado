package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

const bearerKey ctxKey = "bearerKey"

type BearerKeyContext struct {
	KeyID      uuid.UUID
	UserID     uuid.UUID
	DailyLimit int32
}

func Bearer(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if !strings.HasPrefix(h, "Bearer ") {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "missing bearer key"))
				return
			}
			raw := strings.TrimPrefix(h, "Bearer ")
			row, err := q.GetActiveKeyByHash(r.Context(), keys.Hash(raw))
			if errors.Is(err, pgx.ErrNoRows) {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "invalid key"))
				return
			}
			if err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", "key lookup"))
				return
			}
			if row.Banned {
				apperr.Write(w, apperr.Forbidden("BANNED", "account suspended"))
				return
			}
			ctx := context.WithValue(r.Context(), bearerKey, BearerKeyContext{
				KeyID:      row.ID,
				UserID:     row.UserID,
				DailyLimit: row.DailyLimit,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func BearerFromContext(ctx context.Context) (BearerKeyContext, bool) {
	v, ok := ctx.Value(bearerKey).(BearerKeyContext)
	return v, ok
}
