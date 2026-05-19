package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/auth/oauth"
	"github.com/ado/ado/backend/internal/config"
	httpapi "github.com/ado/ado/backend/internal/http"
	"github.com/ado/ado/backend/internal/http/handlers"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keyencrypt"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/mailer"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/store/redis"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		// Use basic logger before structured one is configured.
		slog.Error("config load", "err", err)
		os.Exit(1)
	}

	var logLevel slog.Level
	switch cfg.LogLevel {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	// Run migrations before opening the pool so the schema is always current.
	sqlDB, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		slog.Error("migration db open", "err", err)
		os.Exit(1)
	}
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		slog.Error("migrations failed", "err", err)
		os.Exit(1)
	}
	if err := sqlDB.Close(); err != nil {
		slog.Error("migration db close", "err", err)
	}

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	rdb, err := redis.New(ctx, cfg.RedisURL)
	if err != nil {
		slog.Error("redis connect", "err", err)
		os.Exit(1)
	}
	defer rdb.Close()

	queries := db.New(pool)
	keysSvc := keys.NewService(queries, rdb)
	sessions := auth.NewSessions(queries, auth.SessionConfig{
		IdleDays:     cfg.SessionIdleDays,
		AbsoluteDays: cfg.SessionAbsoluteDays,
		CookieSecure: cfg.SessionCookieSecure,
		CrossOrigin:  cfg.FrontendOrigin != "",
	})
	verifier := auth.NewVerifier(queries)

	var ml mailer.Mailer
	switch cfg.Mailer {
	case "resend":
		ml = mailer.NewResend(cfg.ResendAPIKey, cfg.MailFrom)
	default:
		ml = mailer.NewConsole(os.Stdout)
	}

	authH := handlers.NewAuth(handlers.AuthDeps{
		Cfg: cfg, Q: queries, Sessions: sessions, Verifier: verifier, Mailer: ml, Keys: keysSvc,
	})
	limiter := mw.NewLimiter(rdb)

	var googleH *handlers.Google
	if cfg.GoogleOAuthClientID == "" {
		slog.Info("google oauth not configured")
	} else {
		googleClient, err := oauth.NewGoogle(ctx, oauth.Config{
			ClientID:     cfg.GoogleOAuthClientID,
			ClientSecret: cfg.GoogleOAuthClientSecret,
			RedirectURL:  cfg.GoogleOAuthRedirectURL,
		}, rdb)
		if err != nil {
			slog.Warn("google oauth disabled", "err", err)
		} else {
			googleH = handlers.NewGoogle(handlers.GoogleDeps{
				Cfg: cfg, Q: queries, Sessions: sessions, Google: googleClient, Keys: keysSvc,
			})
		}
	}

	keysH := handlers.NewKeys(handlers.KeysDeps{Q: queries, Keys: keysSvc})

	// Load active provider from DB; fall back to env config on first deploy.
	var reg *proxy.Registry
	maint := &proxy.MaintenanceFlag{}

	{
		active, err := queries.GetActiveProvider(ctx)
		if err == nil {
			plainKey, kerr := keyencrypt.Decrypt(active.ApiKey, cfg.ProviderKeySecret)
			if kerr != nil {
				slog.Error("decrypt active provider key", "err", kerr)
				os.Exit(1)
			}
			reg = proxy.NewRegistry(active.BaseUrl, plainKey)
		} else {
			reg = proxy.NewRegistry(cfg.GeminiBaseURL, cfg.GeminiAPIKey)
		}
	}

	// Load maintenance mode from DB.
	{
		v, err := queries.GetSetting(ctx, "maintenance_mode")
		if err == nil {
			maint.Set(v == "true")
		}
	}

	quotaSvc := quota.NewService(queries)
	proxyH := handlers.NewProxy(handlers.ProxyDeps{
		Registry:    reg,
		Maintenance: maint,
		Quota:       quotaSvc,
	})

	// Admin handlers
	adminMW := mw.RequireAdmin(queries)
	adminProvH := handlers.NewAdminProviders(handlers.AdminProvidersDeps{Q: queries, Registry: reg, ProviderKeySecret: cfg.ProviderKeySecret})
	adminUsersH := handlers.NewAdminUsers(queries)
	adminStatsH := handlers.NewAdminStats(queries)
	adminQuotasH := handlers.NewAdminQuotas(queries)
	adminErrorsH := handlers.NewAdminErrors(queries)
	adminMaintH := handlers.NewAdminMaintenance(queries, maint)

	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				if err := queries.DeleteExpiredSessions(ctx); err != nil {
					slog.Warn("delete expired sessions", "err", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	router := httpapi.NewRouter(httpapi.Deps{
		Sessions:         sessions,
		Auth:             authH,
		Limiter:          limiter,
		Rdb:              rdb,
		Google:           googleH,
		Keys:             keysH,
		Proxy:            proxyH,
		Queries:          queries,
		AdminProviders:   adminProvH,
		AdminUsers:       adminUsersH,
		AdminStats:       adminStatsH,
		AdminQuotas:      adminQuotasH,
		AdminErrors:      adminErrorsH,
		AdminMaintenance: adminMaintH,
		AdminMiddleware:  adminMW,
		FrontendOrigin:   cfg.FrontendOrigin,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      0, // streaming
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("listen", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()
	_ = srv.Shutdown(shutCtx)
}
