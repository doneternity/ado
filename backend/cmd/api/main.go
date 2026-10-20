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

	"github.com/jackc/pgx/v5/pgtype"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/ado/ado/backend/internal/alert"
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

// How long logs are kept. The privacy policy (frontend/src/pages/Privacy.tsx)
// only says "a limited time", so these can change without editing it.
const (
	errorLogRetentionDays   = 30
	usageRetentionDays      = 90
	requestLogRetentionDays = 90
	auditLogRetentionDays   = 365 // admin_audit_log: long enough to answer "who changed this?"
)

// Error spike alert: this many errors within one window sends a Discord alert.
const (
	errorSpikeWindow   = 5 * time.Minute
	errorSpikeServer   = 10 // 5xx responses
	errorSpikeFrontend = 5  // website crash reports
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
	mw.ConfigureClientIP(cfg.ClientIPHeader, cfg.TrustedProxyHops)
	if cfg.OriginSecret == "" {
		slog.Warn("ORIGIN_SECRET not set; the backend accepts requests that bypass Vercel")
	}

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
	keysSvc := keys.NewService(queries, pool, rdb)
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
		Queries:     queries,
	})

	slotsH := handlers.NewSlots(queries)
	healthH := handlers.NewHealth(
		func(ctx context.Context) error {
			// a real query, not just a connection ping, so it counts as activity.
			_, err := pool.Exec(ctx, "SELECT 1 FROM system_settings LIMIT 1")
			return err
		},
		func(ctx context.Context) error { return rdb.Ping(ctx).Err() },
	)

	adminMW := mw.RequireAdmin(queries)
	adminProvH := handlers.NewAdminProviders(handlers.AdminProvidersDeps{Q: queries, Registry: reg, ProviderKeySecret: cfg.ProviderKeySecret})
	adminUsersH := handlers.NewAdminUsers(queries)
	adminStatsH := handlers.NewAdminStats(queries)
	adminQuotasH := handlers.NewAdminQuotas(queries, rpmCfg)
	adminErrorsH := handlers.NewAdminErrors(queries)
	adminMaintH := handlers.NewAdminMaintenance(queries, maint)
	adminPlansH := handlers.NewAdminPlans(queries)
	adminReqInfoH := handlers.NewAdminRequestInfo(limiter)
	usageLogH := handlers.NewUsageLog(queries)
	clientErrorsH := handlers.NewClientErrors(queries, limiter)
	announcementH := handlers.NewAnnouncement(queries)
	statusHistoryH := handlers.NewStatusHistory(queries, reg.ServedModelIDs)
	adminAuditH := handlers.NewAdminAudit(queries)

	// Operator alerts go to the Discord webhook, if configured.
	notifier := alert.NewDiscord(cfg.AlertWebhookURL)
	if !notifier.Enabled() {
		slog.Info("ALERT_WEBHOOK_URL not set; alerts are log-only")
	}
	sendAlert := func(msg string) {
		slog.Warn("alert", "msg", msg)
		sctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		if err := notifier.Send(sctx, "**ADO:** "+msg); err != nil {
			slog.Warn("send alert", "err", err)
		}
	}

	// Hourly housekeeping. Each job also runs once at startup, so frequent
	// deploys (which restart the timers) can't keep postponing it.
	every(ctx, time.Hour, func(ctx context.Context) {
		if err := queries.DeleteExpiredSessions(ctx); err != nil {
			slog.Warn("delete expired sessions", "err", err)
		}
	})
	every(ctx, time.Hour, func(ctx context.Context) {
		handlers.ReapInactiveKeys(ctx, queries, maint)
	})
	// Retention cleanup: error logs 30 days, daily usage counters and request
	// logs 90 days, the admin audit log a year.
	every(ctx, time.Hour, func(ctx context.Context) {
		if err := queries.DeleteOldErrorLogs(ctx, int32(errorLogRetentionDays)); err != nil {
			slog.Warn("delete old error logs", "err", err)
		}
		if err := queries.DeleteOldUsage(ctx, usageRetentionDays); err != nil {
			slog.Warn("delete old usage", "err", err)
		}
		if err := queries.DeleteOldRequestLogs(ctx, requestLogRetentionDays); err != nil {
			slog.Warn("delete old request logs", "err", err)
		}
		if err := queries.DeleteOldAuditLogs(ctx, auditLogRetentionDays); err != nil {
			slog.Warn("delete old audit logs", "err", err)
		}
	})

	// Background model health prober: cycles through the live model list a few at
	// a time so /models reports real chat availability, not just "listed".
	if cfg.ModelProbeInterval > 0 {
		go func() {
			t := time.NewTicker(time.Duration(cfg.ModelProbeInterval) * time.Second)
			defer t.Stop()
			cursor := 0
			batch := cfg.ModelProbeBatch
			if batch < 1 {
				batch = 1
			}
			for {
				select {
				case <-t.C:
					ids := reg.CachedModelIDs()
					if len(ids) == 0 {
						continue
					}
					for i := 0; i < batch && i < len(ids); i++ {
						model := ids[cursor%len(ids)]
						cursor++
						pctx, cancel := context.WithTimeout(ctx, 30*time.Second)
						reg.Probe(pctx, model)
						cancel()
					}
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	// Provider monitor: alerts (Discord webhook, if configured) when providers go
	// down or recover, so a dead upstream key doesn't go unnoticed for months.
	if cfg.ProviderCheckInterval > 0 {
		monitor := proxy.NewProviderMonitor(reg, sendAlert)
		go func() {
			t := time.NewTicker(time.Duration(cfg.ProviderCheckInterval) * time.Second)
			defer t.Stop()
			for {
				monitor.Check(ctx)
				select {
				case <-t.C:
				case <-ctx.Done():
					return
				}
			}
		}()
	}

	// Error spike alert: a burst of 5xx responses or website crash reports (both
	// land in error_logs) posts once to Discord, then waits an hour.
	spike := &alert.ErrorSpike{
		ServerThreshold:   errorSpikeServer,
		FrontendThreshold: errorSpikeFrontend,
		Cooldown:          time.Hour,
		Send:              sendAlert,
	}
	every(ctx, errorSpikeWindow, func(ctx context.Context) {
		now := time.Now()
		n, err := queries.CountErrorLogsSince(ctx, pgtype.Timestamptz{Time: now.Add(-errorSpikeWindow), Valid: true})
		if err != nil {
			slog.Warn("count recent errors", "err", err)
			return
		}
		spike.Observe(now, errorSpikeWindow, n.Server, n.Frontend)
	})

	router := httpapi.NewRouter(httpapi.Deps{
		Sessions:         sessions,
		Auth:             authH,
		Limiter:          limiter,
		Rdb:              rdb,
		Discord:          discordH,
		Keys:             keysH,
		Proxy:            proxyH,
		Queries:          queries,
		RpmCfg:           rpmCfg,
		Slots:            slotsH,
		Health:           healthH,
		AdminProviders:   adminProvH,
		AdminUsers:       adminUsersH,
		AdminStats:       adminStatsH,
		AdminQuotas:      adminQuotasH,
		AdminErrors:      adminErrorsH,
		AdminMaintenance: adminMaintH,
		AdminPlans:       adminPlansH,
		AdminRequestInfo: adminReqInfoH,
		UsageLog:         usageLogH,
		ClientErrors:     clientErrorsH,
		Announcement:     announcementH,
		StatusHistory:    statusHistoryH,
		AdminAudit:       adminAuditH,
		AdminMiddleware:  adminMW,
		Maintenance:      maint,
		FrontendOrigin:   cfg.FrontendOrigin,
		OriginSecret:     cfg.OriginSecret,
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

// every runs fn now and then once per interval until ctx is cancelled.
func every(ctx context.Context, interval time.Duration, fn func(context.Context)) {
	go func() {
		fn(ctx)
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				fn(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}
