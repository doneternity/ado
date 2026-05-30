package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

const bearerKey ctxKey = "bearerKey"

type BearerKeyContext struct {
	KeyID         uuid.UUID
	UserID        uuid.UUID
	DailyLimit    int32
	ReasoningMode bool
}

func Bearer(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
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
			// keep last_used_at fresh so the reaper only revokes idle keys.
			// detached + async so it never delays the request; the query
			// self-debounces to ~once per 30s per key.
			go func(id uuid.UUID) {
				tctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				_ = q.TouchKeyLastUsed(tctx, id)
			}(row.ID)
			ctx := context.WithValue(r.Context(), bearerKey, BearerKeyContext{
				KeyID:         row.ID,
				UserID:        row.UserID,
				DailyLimit:    row.DailyLimit,
				ReasoningMode: row.ReasoningMode,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func BearerFromContext(ctx context.Context) (BearerKeyContext, bool) {
	v, ok := ctx.Value(bearerKey).(BearerKeyContext)
	return v, ok
}
