package tests

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/config"
	httpapi "github.com/ado/ado/backend/internal/http"
	"github.com/ado/ado/backend/internal/http/handlers"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
	"github.com/ado/ado/backend/internal/store/db"
)

// sharedDSN and sharedRedisURL are set once by TestMain and reused across all tests.
var sharedDSN string
var sharedRedisURL string

// TestMain creates containers once for the entire package (or uses CI service containers).
func TestMain(m *testing.M) {
	ctx := context.Background()

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		sharedDSN = dsn
		sqlDB, err := sql.Open("pgx", sharedDSN)
		if err != nil {
			fmt.Fprintf(os.Stderr, "open db: %v\n", err)
			os.Exit(1)
		}
		if err := goose.Up(sqlDB, "../migrations"); err != nil {
			fmt.Fprintf(os.Stderr, "initial migrations: %v\n", err)
			os.Exit(1)
		}
		sqlDB.Close() //nolint:errcheck
	} else {
		pgC, err := postgres.Run(ctx, "postgres:16-alpine",
			postgres.WithDatabase("ado"),
			postgres.WithUsername("ado"),
			postgres.WithPassword("ado"),
			testcontainers.WithWaitStrategy(wait.ForListeningPort("5432/tcp").WithStartupTimeout(60*time.Second)),
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "postgres container: %v\n", err)
			os.Exit(1)
		}
		defer pgC.Terminate(ctx) //nolint:errcheck

		sharedDSN, err = pgC.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			fmt.Fprintf(os.Stderr, "postgres connection string: %v\n", err)
			os.Exit(1)
		}

		// Prime the schema so each test can safely call goose.Reset.
		sqlDB, err := sql.Open("pgx", sharedDSN)
		if err != nil {
			fmt.Fprintf(os.Stderr, "open db: %v\n", err)
			os.Exit(1)
		}
		if err := goose.Up(sqlDB, "../migrations"); err != nil {
			fmt.Fprintf(os.Stderr, "initial migrations: %v\n", err)
			os.Exit(1)
		}
		sqlDB.Close()
	}

	if rURL := os.Getenv("REDIS_URL"); rURL != "" {
		sharedRedisURL = rURL
	} else {
		rC, err := tcredis.Run(ctx, "redis:7-alpine",
			testcontainers.WithWaitStrategy(wait.ForListeningPort("6379/tcp").WithStartupTimeout(30*time.Second)),
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "redis container: %v\n", err)
			os.Exit(1)
		}
		defer rC.Terminate(ctx) //nolint:errcheck

		sharedRedisURL, err = rC.ConnectionString(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "redis connection string: %v\n", err)
			os.Exit(1)
		}
	}

	os.Exit(m.Run())
}

type fixture struct {
	server     *httptest.Server
	pool       *pgxpool.Pool
	rdb        *redis.Client
	mailer     *captureMailer
	fakeGemini *httptest.Server
}

type captureMailer struct{ Last string }

func (c *captureMailer) SendVerification(_ context.Context, _, link string) error {
	c.Last = link
	return nil
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()

	// Reset DB state: drop all tables then re-run migrations.
	sqlDB, err := sql.Open("pgx", sharedDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	if err := goose.Reset(sqlDB, "../migrations"); err != nil {
		t.Fatal(err)
	}
	if err := goose.Up(sqlDB, "../migrations"); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, sharedDSN)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	// Flush Redis.
	opt, err := redis.ParseURL(sharedRedisURL)
	if err != nil {
		t.Fatal(err)
	}
	rdb := redis.NewClient(opt)
	t.Cleanup(func() { _ = rdb.Close() })
	if err := rdb.FlushDB(ctx).Err(); err != nil {
		t.Fatal(err)
	}

	q := db.New(pool)
	cfg := &config.Config{
		AppBaseURL:          "http://test",
		SessionIdleDays:     7,
		SessionAbsoluteDays: 30,
		SessionCookieSecure: false,
	}
	sessions := auth.NewSessions(q, auth.SessionConfig{IdleDays: 7, AbsoluteDays: 30, CookieSecure: false})
	verifier := auth.NewVerifier(q)
	cap := &captureMailer{}
	keysSvc := keys.NewService(q, rdb)
	authH := handlers.NewAuth(handlers.AuthDeps{
		Cfg: cfg, Q: q, Sessions: sessions, Verifier: verifier, Mailer: cap, Keys: keysSvc,
	})
	limiter := mw.NewLimiter(rdb)
	keysH := handlers.NewKeys(handlers.KeysDeps{Q: q, Keys: keysSvc})

	fakeGemini := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"id":"chatcmpl-test","object":"chat.completion","model":"gemini-test","choices":[{"index":0,"message":{"role":"assistant","content":"hi"},"finish_reason":"stop"}]}`))
	}))
	t.Cleanup(fakeGemini.Close)

	reg := proxy.NewRegistry(fakeGemini.URL, "test-upstream-key")
	maint := &proxy.MaintenanceFlag{}
	quotaSvc := quota.NewService(q)
	proxyH := handlers.NewProxy(handlers.ProxyDeps{Registry: reg, Maintenance: maint, Quota: quotaSvc})

	adminMW := func(next http.Handler) http.Handler { return next }
	adminProvH := handlers.NewAdminProviders(handlers.AdminProvidersDeps{Q: q, Registry: reg})
	adminUsersH := handlers.NewAdminUsers(q)
	adminStatsH := handlers.NewAdminStats(q)
	adminQuotasH := handlers.NewAdminQuotas(q)
	adminErrorsH := handlers.NewAdminErrors(q)
	adminMaintH := handlers.NewAdminMaintenance(q, maint)

	router := httpapi.NewRouter(httpapi.Deps{
		Sessions: sessions, Auth: authH, Limiter: limiter, Rdb: rdb, Keys: keysH,
		Proxy: proxyH, Queries: q,
		AdminProviders: adminProvH, AdminUsers: adminUsersH, AdminStats: adminStatsH,
		AdminQuotas: adminQuotasH, AdminErrors: adminErrorsH, AdminMaintenance: adminMaintH,
		AdminMiddleware: adminMW,
	})
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)

	_ = os.Setenv("APP_BASE_URL", srv.URL)

	return &fixture{server: srv, pool: pool, rdb: rdb, mailer: cap, fakeGemini: fakeGemini}
}

func mustToken(s string) string {
	i := lastIndex(s, "token=")
	if i < 0 {
		return ""
	}
	return s[i+len("token="):]
}

// signupAndVerify completes the full signup → email verification flow and
// returns the verify-response body. The caller's cookie jar holds the session.
func signupAndVerify(t *testing.T, fx *fixture, c *http.Client, email, pass string) map[string]any {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": pass})
	r, err := c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("signup: %v", err)
	}
	if r.StatusCode != 201 {
		b, _ := io.ReadAll(r.Body)
		t.Fatalf("signup status=%d body=%s", r.StatusCode, b)
	}
	r.Body.Close()

	tok := mustToken(fx.mailer.Last)
	if tok == "" {
		t.Fatalf("no verification token captured (mailer.Last=%q)", fx.mailer.Last)
	}
	vbody, _ := json.Marshal(map[string]string{"token": tok})
	r, err = c.Post(fx.server.URL+"/api/auth/verify", "application/json", bytes.NewReader(vbody))
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if r.StatusCode != 200 {
		b, _ := io.ReadAll(r.Body)
		t.Fatalf("verify status=%d body=%s", r.StatusCode, b)
	}
	var out map[string]any
	_ = json.NewDecoder(r.Body).Decode(&out)
	r.Body.Close()
	return out
}

func lastIndex(s, sub string) int {
	for i := len(s) - len(sub); i >= 0; i-- {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

var _ = fmt.Sprintf
