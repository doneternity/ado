package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

// RequestNote is what a proxy handler knows about a request beyond its status:
// the model asked for, who served it, and token counts if reported. Handlers
// fill it via RequestNoteFrom; RequestLog writes it out.
type RequestNote struct {
	Model            string
	Provider         string
	Stream           bool
	PromptTokens     *int32
	CompletionTokens *int32
	// Status is the real outcome when it differs from the status sent: the
	// proxy's keep-alive sends 200 before it knows how a request will end.
	Status int
}

type requestNoteKey struct{}

// RequestNoteFrom returns the note for this request, or nil outside RequestLog.
func RequestNoteFrom(ctx context.Context) *RequestNote {
	n, _ := ctx.Value(requestNoteKey{}).(*RequestNote)
	return n
}

// RequestLog records one request_log row per API request made with a key:
// endpoint, model, status, duration and token counts. Never content or IPs.
// It must run after Bearer. The insert happens in the background so it adds no
// latency, and a failed insert only logs a warning.
func RequestLog(q *db.Queries, prefix string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bk, ok := BearerFromContext(r.Context())
			if !ok || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			note := &RequestNote{}
			rec := &statusRecorder{ResponseWriter: w}
			start := time.Now()
			next.ServeHTTP(rec, r.WithContext(context.WithValue(r.Context(), requestNoteKey{}, note)))

			status := rec.status
			if note.Status != 0 {
				status = note.Status
			}
			if status == 0 {
				status = http.StatusSwitchingProtocols // hijacked (websocket); nothing was written
			}
			params := db.InsertRequestLogParams{
				UserID:           bk.UserID,
				KeyID:            pgtype.UUID{Bytes: bk.KeyID, Valid: true},
				Endpoint:         strings.TrimPrefix(r.URL.Path, prefix),
				Model:            optional(note.Model),
				Status:           int32(status),
				DurationMs:       int32(time.Since(start).Milliseconds()),
				Stream:           note.Stream,
				Provider:         optional(note.Provider),
				PromptTokens:     note.PromptTokens,
				CompletionTokens: note.CompletionTokens,
			}
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := q.InsertRequestLog(ctx, params); err != nil {
					slog.Warn("insert request log", "err", err)
				}
			}()
		})
	}
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
