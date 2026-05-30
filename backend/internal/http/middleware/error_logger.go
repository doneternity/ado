package middleware

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"

	"github.com/ado/ado/backend/internal/store/db"
)

// ErrorLogger captures 5xx responses and asynchronously writes them to error_logs.
func ErrorLogger(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rw := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(rw, r)
			if rw.status >= 500 {
				method, path, status := r.Method, r.URL.Path, rw.status
				ctx := map[string]any{"method": method, "path": path, "status": status}
				raw, _ := json.Marshal(ctx)
				go func() {
					if err := q.InsertErrorLog(context.Background(), db.InsertErrorLogParams{
						Level:   "error",
						Message: fmt.Sprintf("%s %s → %d", method, path, status),
						Context: raw,
					}); err != nil {
						slog.Warn("error_log insert failed", "err", err)
					}
				}()
			}
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}

func (sw *statusWriter) Write(b []byte) (int, error) {
	if sw.status == 0 {
		sw.status = http.StatusOK
	}
	return sw.ResponseWriter.Write(b)
}

// unwrap so ResponseController can reach the real writer; without it the
// wrapper would break streaming (flush) and websocket upgrades (hijack).
func (sw *statusWriter) Unwrap() http.ResponseWriter { return sw.ResponseWriter }

func (sw *statusWriter) Flush() {
	_ = http.NewResponseController(sw.ResponseWriter).Flush()
}

func (sw *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return http.NewResponseController(sw.ResponseWriter).Hijack()
}
