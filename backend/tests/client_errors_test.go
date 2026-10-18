package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

// TestClientErrors_StoresReport checks that a website crash report lands in
// error_logs tagged as frontend, without the page's query string, and is
// counted separately from server errors by the spike alert query.
func TestClientErrors_StoresReport(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	q := db.New(fx.pool)

	post := func(body string) int {
		t.Helper()
		resp, err := http.Post(fx.server.URL+"/api/client-errors", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	report, _ := json.Marshal(map[string]string{
		"kind":    "render",
		"message": "TypeError: x is undefined",
		"stack":   "at Dashboard (/assets/Dashboard-abc.js:1:2)",
		"page":    "https://adoai.space/dashboard?email=someone@example.com#top",
	})
	if code := post(string(report)); code != http.StatusNoContent {
		t.Fatalf("report: status %d, want 204", code)
	}
	if code := post(`{"message":"   "}`); code != http.StatusBadRequest {
		t.Fatalf("empty message: status %d, want 400", code)
	}
	if code := post(`{"message":"` + strings.Repeat("x", 20<<10) + `"}`); code != http.StatusBadRequest {
		t.Fatalf("oversized report: status %d, want 400", code)
	}

	logs, err := q.ListErrorLogs(ctx, db.ListErrorLogsParams{Limit: 10})
	if err != nil || len(logs) != 1 {
		t.Fatalf("ListErrorLogs: %v, %d rows (want 1)", err, len(logs))
	}
	if logs[0].Message != "website: TypeError: x is undefined" {
		t.Fatalf("message = %q", logs[0].Message)
	}
	var c map[string]string
	if err := json.Unmarshal(logs[0].Context, &c); err != nil {
		t.Fatal(err)
	}
	if c["source"] != "frontend" || c["kind"] != "render" || c["page"] != "/dashboard" {
		t.Fatalf("context = %v", c)
	}
	if bytes.Contains(logs[0].Context, []byte("someone@example.com")) {
		t.Fatal("query string was stored")
	}

	// A server error, for the split count.
	if err := q.InsertErrorLog(ctx, db.InsertErrorLogParams{Level: "error", Message: "GET /x → 500", Context: []byte(`{"status":500}`)}); err != nil {
		t.Fatal(err)
	}
	n, err := q.CountErrorLogsSince(ctx, pgtype.Timestamptz{Time: time.Now().Add(-time.Minute), Valid: true})
	if err != nil {
		t.Fatal(err)
	}
	if n.Frontend != 1 || n.Server != 1 {
		t.Fatalf("counts = %+v, want 1 frontend and 1 server", n)
	}
}
