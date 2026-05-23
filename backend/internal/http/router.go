package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/http/handlers"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
)

type Deps struct {
	Sessions         *auth.Sessions
	Auth             *handlers.Auth
	Limiter          *mw.Limiter
	Rdb              *redis.Client
	Discord          *handlers.DiscordHandler
	Keys             *handlers.Keys
	Proxy            *handlers.Proxy
	Queries          *db.Queries
	RpmCfg           *proxy.RpmConfig
	AdminProviders   *handlers.AdminProviders
	AdminUsers       *handlers.AdminUsers
	AdminStats       *handlers.AdminStats
	AdminQuotas      *handlers.AdminQuotas
	AdminErrors      *handlers.AdminErrors
	AdminMaintenance *handlers.AdminMaintenance
	AdminMiddleware  func(http.Handler) http.Handler
	FrontendOrigin   string
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(mw.Recover)
	r.Use(mw.Logger)
	r.Use(mw.ErrorLogger(d.Queries))
	r.Use(mw.LoadSession(d.Sessions, d.Queries))
	r.Use(mw.MaxBodySize(1 << 20)) // 1 MB hard cap for all routes

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api/auth", func(r chi.Router) {
		r.Use(mw.CORSPrivate(d.FrontendOrigin))
		r.With(mw.CSRF).Post("/logout", d.Auth.Logout)
		r.Get("/me", d.Auth.Me)
		if d.Discord != nil {
			r.With(d.Limiter.PerIP("rl:auth:discord:ip", 20, time.Hour, false)).
				Get("/discord", d.Discord.Start)
			r.Get("/discord/callback", d.Discord.Callback)
		}
	})

	r.Route("/api/keys", func(r chi.Router) {
		r.Use(mw.CORSPrivate(d.FrontendOrigin))
		r.Get("/current", d.Keys.Current)
		r.With(mw.CSRF, d.Limiter.PerIP("rl:keys:rotate:ip", 5, time.Hour, true)).Post("/rotate", d.Keys.Rotate)
		r.Get("/flash", d.Keys.Flash)
	})

	r.With(mw.CORSPublic, d.Limiter.PerIP("rl:models:ip", 10, time.Minute, false)).
		Get("/api/models", d.Proxy.PublicModels)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.CORSPublic)
		r.Use(mw.Bearer(d.Queries))
		r.With(d.Limiter.PerKey("rl:v1:models:key", 30, time.Minute, false)).
			Get("/models", d.Proxy.Models)
		r.With(d.Limiter.PerKeyDynamic("rl:v1:chat:key", d.RpmCfg.Get, time.Minute, false)).
			Post("/chat/completions", d.Proxy.ChatCompletions)
	})

	r.Route("/api/admin", func(r chi.Router) {
		r.Use(d.Limiter.PerIP("rl:admin:ip", 60, time.Hour, false))
		r.Use(d.AdminMiddleware)
		r.Use(mw.CORSPrivate(d.FrontendOrigin))
		r.Use(mw.CSRF)

		r.Get("/providers", d.AdminProviders.List)
		r.Post("/providers", d.AdminProviders.Create)
		r.Put("/providers/{id}", d.AdminProviders.Update)
		r.Delete("/providers/{id}", d.AdminProviders.Delete)
		r.Patch("/providers/{id}/active", d.AdminProviders.SetActive)

		r.Get("/users", d.AdminUsers.List)
		r.Patch("/users/{id}/role", d.AdminUsers.SetRole)
		r.Patch("/users/{id}/banned", d.AdminUsers.SetBanned)

		r.Get("/stats", d.AdminStats.Get)

		r.Get("/quotas", d.AdminQuotas.Get)
		r.Put("/quotas/global", d.AdminQuotas.SetGlobal)
		r.Put("/quotas/rpm", d.AdminQuotas.SetGlobalRPM)
		r.Put("/quotas/users/by-email", d.AdminQuotas.SetUserOverride)
		r.Delete("/quotas/users/{id}", d.AdminQuotas.RemoveUserOverride)

		r.Get("/errors", d.AdminErrors.List)
		r.Delete("/errors/{id}", d.AdminErrors.Delete)
		r.Delete("/errors", d.AdminErrors.BulkDelete)

		r.Get("/maintenance", d.AdminMaintenance.Get)
		r.Post("/maintenance/toggle", d.AdminMaintenance.Toggle)
	})

	return r
}
