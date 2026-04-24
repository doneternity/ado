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

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/config"
	"github.com/ado/ado/backend/internal/http/handlers"
	httpapi "github.com/ado/ado/backend/internal/http"
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

	dsn, err := pgC.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}

	// Migrate.
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	if err := goose.Up(sqlDB, "../migrations"); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	rC, err := tcredis.Run(ctx, "redis:7-alpine",
		testcontainers.WithWaitStrategy(wait.ForListeningPort("6379/tcp").WithStartupTimeout(30*time.Second)),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = rC.Terminate(ctx) })

	rURL, err := rC.ConnectionString(ctx)
	if err != nil {
		t.Fatal(err)
	}
	rOpt, _ := redis.ParseURL(rURL)
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

	forwarder := proxy.New(fakeGemini.URL, "test-upstream-key")
	quotaSvc := quota.NewService(q)
	proxyH := handlers.NewProxy(handlers.ProxyDeps{Forwarder: forwarder, Quota: quotaSvc})

	router := httpapi.NewRouter(httpapi.Deps{
		Sessions: sessions, Auth: authH, Limiter: limiter, Rdb: rdb, Keys: keysH,
		Proxy: proxyH, Queries: q,
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
