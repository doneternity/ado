package main

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
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
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/store/redis"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
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

	authH := handlers.NewAuth(handlers.AuthDeps{Q: queries, Sessions: sessions})
	limiter := mw.NewLimiter(rdb)

	var discordH *handlers.DiscordHandler
	if cfg.DiscordClientID == "" {
		slog.Info("discord oauth not configured")
	} else {
		discordClient := oauth.NewDiscord(oauth.DiscordConfig{
			ClientID:     cfg.DiscordClientID,
			ClientSecret: cfg.DiscordClientSecret,
			RedirectURL:  cfg.DiscordRedirectURL,
			GuildID:      cfg.DiscordGuildID,
		}, rdb)
		discordH = handlers.NewDiscord(handlers.DiscordDeps{
			Cfg: cfg, Q: queries, Sessions: sessions, Discord: discordClient, Keys: keysSvc,
		})
	}

	reg := proxy.NewRegistry()
	handlers.RebuildChain(ctx, queries, cfg.ProviderKeySecret, reg)
	maint := &proxy.MaintenanceFlag{}
	{
		v, err := queries.GetSetting(ctx, "maintenance_mode")
		if err == nil {
			maint.Set(v == "true")
		}
	}

	rpmCfg := &proxy.RpmConfig{}
	rpmCfg.Set(20) // default
	{
		v, err := queries.GetSetting(ctx, "global_rpm_limit")
		if err == nil {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				rpmCfg.Set(int32(n))
			}
		}
	}

	keysH := handlers.NewKeys(handlers.KeysDeps{Q: queries, Keys: keysSvc, Limiter: limiter, RpmCfg: rpmCfg})

	quotaSvc := quota.NewService(queries)
	proxyH := handlers.NewProxy(handlers.ProxyDeps{
		Registry:    reg,
		Maintenance: maint,
		Quota:       quotaSvc,
	})

	adminMW := mw.RequireAdmin(queries)
	adminProvH := handlers.NewAdminProviders(handlers.AdminProvidersDeps{Q: queries, Registry: reg, ProviderKeySecret: cfg.ProviderKeySecret})
	adminUsersH := handlers.NewAdminUsers(queries)
	adminStatsH := handlers.NewAdminStats(queries)
	adminQuotasH := handlers.NewAdminQuotas(queries, rpmCfg)
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
		Sessions:        sessions,
		Auth:            authH,
		Limiter:         limiter,
		Rdb:             rdb,
		Discord:         discordH,
		Keys:            keysH,
		Proxy:           proxyH,
		Queries:         queries,
		RpmCfg:          rpmCfg,
		AdminProviders:  adminProvH,
		AdminUsers:      adminUsersH,
		AdminStats:      adminStatsH,
		AdminQuotas:     adminQuotasH,
		AdminErrors:     adminErrorsH,
		AdminMaintenance: adminMaintH,
		AdminMiddleware:  adminMW,
		FrontendOrigin:   cfg.FrontendOrigin,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      0,
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
