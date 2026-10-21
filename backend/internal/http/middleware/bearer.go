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

const keyLookupFailed = "couldn't check your API key because of a problem on ADO's side; try again in a moment"

// BannedMessage is what a suspended account sees on every request.
const BannedMessage = "this account is suspended; ask in ADO's Discord server if you think this is a mistake"

type BearerKeyContext struct {
	KeyID      uuid.UUID
	UserID     uuid.UUID
	DailyLimit int32
	// PlanRPM is the plan's per-minute limit; 0 means use the global RPM.
	PlanRPM       int32
	ReasoningMode bool
}

func Bearer(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			raw := apiKeyFrom(r)
			if raw == "" {
				msg := "missing API key: send it as \"Authorization: Bearer <key>\""
				if strings.TrimSpace(r.Header.Get("Authorization")) != "" {
					msg = "the Authorization header should be \"Bearer <key>\", with the word Bearer and a space before the key"
				}
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", msg))
				return
			}
			if !strings.HasPrefix(raw, "ado-") {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "that isn't an ADO key: ADO keys start with \"ado-\"; copy yours from https://adoai.space/dashboard"))
				return
			}
			hash := keys.Hash(raw)
			row, err := q.GetActiveKeyByHash(r.Context(), hash)
			if errors.Is(err, pgx.ErrNoRows) {
				msg := "this API key isn't valid: it may be mistyped; copy your current key from https://adoai.space/dashboard"
				if revoked, rerr := q.IsRevokedKeyHash(r.Context(), hash); rerr == nil && revoked {
					msg = "this API key has been turned off: keys stop working when they're rotated, and free keys after 14 days without use; get a new one at https://adoai.space/dashboard"
				}
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", msg))
				return
			}
			if err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", keyLookupFailed))
				return
			}
			if row.Banned {
				apperr.Write(w, apperr.Forbidden("BANNED", BannedMessage))
				return
			}
			touchKey(q, row.ID)
			ctx := context.WithValue(r.Context(), bearerKey, BearerKeyContext{
				KeyID:         row.ID,
				UserID:        row.UserID,
				DailyLimit:    row.DailyLimit,
				PlanRPM:       row.PlanRpm,
				ReasoningMode: row.ReasoningMode,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionKey is Bearer for the website's Playground: it authenticates with the
// signed-in session instead of a raw key, and attaches that user's active key,
// so the backend never has to hand the raw key back to the browser (it only
// stores a hash). Everything downstream (quota, per-key RPM, request log)
// treats the call exactly like one made with the key. Use behind LoadSession
// and CSRF; banned users are already stopped by LoadSession.
func SessionKey(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := SessionFromContext(r.Context())
			if !ok {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "you're signed out: sign in to use the Playground"))
				return
			}
			row, err := q.GetActiveKeyWithQuotaByUser(r.Context(), sess.UserID)
			if errors.Is(err, pgx.ErrNoRows) {
				apperr.Write(w, apperr.Forbidden("NO_KEY", "you don't have an active API key; create one on the dashboard"))
				return
			}
			if err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", keyLookupFailed))
				return
			}
			touchKey(q, row.ID)
			ctx := context.WithValue(r.Context(), bearerKey, BearerKeyContext{
				KeyID:         row.ID,
				UserID:        sess.UserID,
				DailyLimit:    row.DailyLimit,
				PlanRPM:       row.PlanRpm,
				ReasoningMode: row.ReasoningMode,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// touchKey keeps last_used_at fresh so the reaper only revokes idle keys.
// Detached and async so it never delays the request; the query self-debounces
// to about once per 30s per key.
func touchKey(q *db.Queries, id uuid.UUID) {
	go func() {
		tctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = q.TouchKeyLastUsed(tctx, id)
	}()
}

func BearerFromContext(ctx context.Context) (BearerKeyContext, bool) {
	v, ok := ctx.Value(bearerKey).(BearerKeyContext)
	return v, ok
}

// apiKeyFrom reads the ADO key from "Authorization: Bearer <key>" (the scheme
// in any case, as HTTP allows) or from x-api-key, which the Anthropic SDK and
// Claude Code send instead. Providers never see either header: the proxy
// forwards only an allowlist.
func apiKeyFrom(r *http.Request) string {
	if h := strings.TrimSpace(r.Header.Get("Authorization")); len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return strings.TrimSpace(r.Header.Get("X-Api-Key"))
}
