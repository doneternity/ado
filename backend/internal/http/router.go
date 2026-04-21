package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/http/handlers"
	mw "github.com/ado/ado/backend/internal/http/middleware"
)

type Deps struct {
	Sessions *auth.Sessions
	Auth     *handlers.Auth
	Limiter  *mw.Limiter
	Rdb      *redis.Client
	Google   *handlers.Google
	Keys     *handlers.Keys
}

func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(mw.Recover)
	r.Use(mw.Logger)
	r.Use(mw.LoadSession(d.Sessions))

	r.Get("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api/auth", func(r chi.Router) {
		r.With(d.Limiter.PerIP("rl:auth:signup:ip", 5, time.Hour)).
			Post("/signup", d.Auth.Signup)
		r.With(d.Limiter.PerIP("rl:auth:login:ip", 10, time.Hour)).
			Post("/login", d.Auth.Login)
		r.Post("/verify", d.Auth.Verify)
		r.Post("/verify/resend", d.Auth.ResendVerify(d.Rdb))
		r.With(mw.CSRF).Post("/logout", d.Auth.Logout)
		r.Get("/me", d.Auth.Me)
		if d.Google != nil {
			r.Get("/google", d.Google.Start)
			r.Get("/google/callback", d.Google.Callback)
		}
	})

	r.Route("/api/keys", func(r chi.Router) {
		r.Get("/current", d.Keys.Current)
		r.With(mw.CSRF).Post("/rotate", d.Keys.Rotate)
		r.Get("/flash", d.Keys.Flash)
	})

	return r
}
