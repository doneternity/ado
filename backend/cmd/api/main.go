package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/auth/oauth"
	"github.com/ado/ado/backend/internal/config"
	"github.com/ado/ado/backend/internal/http/handlers"
	httpapi "github.com/ado/ado/backend/internal/http"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/mailer"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/store/redis"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load", "err", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

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
	sessions := auth.NewSessions(queries, auth.SessionConfig{
		IdleDays:     cfg.SessionIdleDays,
		AbsoluteDays: cfg.SessionAbsoluteDays,
		CookieSecure: cfg.SessionCookieSecure,
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
		Cfg: cfg, Q: queries, Sessions: sessions, Verifier: verifier, Mailer: ml,
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
				Cfg: cfg, Q: queries, Sessions: sessions, Google: googleClient,
			})
		}
	}

	router := httpapi.NewRouter(httpapi.Deps{
		Sessions: sessions,
		Auth:     authH,
		Limiter:  limiter,
		Rdb:      rdb,
		Google:   googleH,
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
