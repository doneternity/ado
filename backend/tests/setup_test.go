package tests

import (
	"context"
	"database/sql"
	"fmt"
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

	var dsn string
	var rURL string

	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		// CI: use the service container. Reset schema between tests for isolation.
		dsn = envDSN
		sqlDB, err := sql.Open("pgx", dsn)
		if err != nil {
			t.Fatal(err)
		}
		if err := goose.Reset(sqlDB, "../migrations"); err != nil {
			t.Fatal(err)
		}
		if err := goose.Up(sqlDB, "../migrations"); err != nil {
			t.Fatal(err)
		}
		sqlDB.Close()
	} else {
		// Local: spin up a dedicated container.
		pgC, err := postgres.Run(ctx, "postgres:16-alpine",
			postgres.WithDatabase("ado"),
			postgres.WithUsername("ado"),
			postgres.WithPassword("ado"),
			testcontainers.WithWaitStrategy(wait.ForListeningPort("5432/tcp").WithStartupTimeout(60*time.Second)),
		)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = pgC.Terminate(ctx) })

		dsn, err = pgC.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			t.Fatal(err)
		}

		sqlDB, err := sql.Open("pgx", dsn)
		if err != nil {
			t.Fatal(err)
		}
		defer sqlDB.Close()
		if err := goose.Up(sqlDB, "../migrations"); err != nil {
			t.Fatal(err)
		}
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	if envRedis := os.Getenv("REDIS_URL"); envRedis != "" {
		// CI: use the service container. Flush before each test.
		rURL = envRedis
		opt, err := redis.ParseURL(rURL)
		if err != nil {
			t.Fatal(err)
		}
		tmp := redis.NewClient(opt)
		if err := tmp.FlushDB(ctx).Err(); err != nil {
			t.Fatal(err)
		}
		tmp.Close()
	} else {
		// Local: spin up a dedicated container.
		rC, err := tcredis.Run(ctx, "redis:7-alpine",
			testcontainers.WithWaitStrategy(wait.ForListeningPort("6379/tcp").WithStartupTimeout(30*time.Second)),
		)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = rC.Terminate(ctx) })

		rURL, err = rC.ConnectionString(ctx)
		if err != nil {
			t.Fatal(err)
		}
	}

	rOpt, err := redis.ParseURL(rURL)
	if err != nil {
		t.Fatal(err)
	}
	rdb := redis.NewClient(rOpt)
	t.Cleanup(func() { _ = rdb.Close() })

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

	// Stub admin middleware (always allows) for integration tests that don't test admin routes.
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

func lastIndex(s, sub string) int {
	for i := len(s) - len(sub); i >= 0; i-- {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

var _ = fmt.Sprintf
