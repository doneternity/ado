package tests

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
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

var sharedDSN string
var sharedRedisURL string

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
		sqlDB.Close()
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
		defer pgC.Terminate(ctx)
		sharedDSN, err = pgC.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			fmt.Fprintf(os.Stderr, "postgres connection string: %v\n", err)
			os.Exit(1)
		}
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
		defer rC.Terminate(ctx)
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
	fakeGemini *httptest.Server
	sessions   *auth.Sessions
	keys       *keys.Service
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	return buildFixture(t, nil)
}

func newFixtureRealAdmin(t *testing.T) *fixture {
	t.Helper()
	return buildFixture(t, mw.RequireAdmin)
}

func buildFixture(t *testing.T, adminMWFactory func(*db.Queries) func(http.Handler) http.Handler) *fixture {
	t.Helper()
	ctx := context.Background()

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
		DiscordGuildID:      "1506040288182014043",
	}
	sessions := auth.NewSessions(q, auth.SessionConfig{IdleDays: 7, AbsoluteDays: 30, CookieSecure: false})
	keysSvc := keys.NewService(q, rdb)
	authH := handlers.NewAuth(handlers.AuthDeps{Q: q, Sessions: sessions})
	limiter := mw.NewLimiter(rdb)
	keysH := handlers.NewKeys(handlers.KeysDeps{Q: q, Keys: keysSvc})

	fakeGemini := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"chatcmpl-test","object":"chat.completion","model":"gemini-test","choices":[{"index":0,"message":{"role":"assistant","content":"hi"},"finish_reason":"stop"}]}`))
	}))
	t.Cleanup(fakeGemini.Close)

	reg := proxy.NewRegistry(fakeGemini.URL, "test-upstream-key")
	maint := &proxy.MaintenanceFlag{}
	quotaSvc := quota.NewService(q)
	proxyH := handlers.NewProxy(handlers.ProxyDeps{Registry: reg, Maintenance: maint, Quota: quotaSvc})

	var adminMW func(http.Handler) http.Handler
	if adminMWFactory != nil {
		adminMW = adminMWFactory(q)
	} else {
		adminMW = func(next http.Handler) http.Handler { return next }
	}
	adminProvH := handlers.NewAdminProviders(handlers.AdminProvidersDeps{Q: q, Registry: reg})
	adminUsersH := handlers.NewAdminUsers(q)
	adminStatsH := handlers.NewAdminStats(q)
	adminQuotasH := handlers.NewAdminQuotas(q)
	adminErrorsH := handlers.NewAdminErrors(q)
	adminMaintH := handlers.NewAdminMaintenance(q, maint)

	router := httpapi.NewRouter(httpapi.Deps{
		Sessions: sessions, Auth: authH, Limiter: limiter, Rdb: rdb, Keys: keysH,
		Proxy: proxyH, Queries: q, AdminProviders: adminProvH, AdminUsers: adminUsersH,
		AdminStats: adminStatsH, AdminQuotas: adminQuotasH, AdminErrors: adminErrorsH,
		AdminMaintenance: adminMaintH, AdminMiddleware: adminMW,
	})
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)
	_ = cfg

	return &fixture{
		server:     srv,
		pool:       pool,
		rdb:        rdb,
		fakeGemini: fakeGemini,
		sessions:   sessions,
		keys:       keysSvc,
	}
}

// createDiscordUser inserts a Discord user, creates a session, applies the
// session cookie to c's jar, and returns (csrfToken, rawAPIKey).
func createDiscordUser(t *testing.T, fx *fixture, c *http.Client, discordID, email string) (csrfToken, rawKey string) {
	t.Helper()
	ctx := context.Background()

	var userID uuid.UUID
	if err := fx.pool.QueryRow(ctx, `
		INSERT INTO users (email, email_verified, discord_id, display_name, role)
		VALUES ($1, true, $2, 'Test User', 'user') RETURNING id`,
		email, discordID).Scan(&userID); err != nil {
		t.Fatalf("createDiscordUser: %v", err)
	}

	sess, cookieValue, err := fx.sessions.Create(ctx, userID, "test-agent", "")
	if err != nil {
		t.Fatalf("createDiscordUser session: %v", err)
	}

	u, err := url.Parse(fx.server.URL)
	if err != nil {
		t.Fatalf("createDiscordUser: parse server URL: %v", err)
	}
	c.Jar.SetCookies(u, []*http.Cookie{{
		Name:  auth.CookieName,
		Value: cookieValue,
	}})

	issued, err := fx.keys.EnsureForUser(ctx, userID)
	if err != nil {
		t.Fatalf("createDiscordUser key: %v", err)
	}
	if issued.Raw == "" {
		t.Fatal("createDiscordUser: EnsureForUser returned no key")
	}
	return base64.RawURLEncoding.EncodeToString(sess.CSRFToken), issued.Raw
}

func decodeJSON(t *testing.T, r *http.Response, v any) {
	t.Helper()
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		t.Fatalf("decodeJSON: %v", err)
	}
}

var _ = fmt.Sprintf
