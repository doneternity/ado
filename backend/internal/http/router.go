package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	mw "github.com/ado/ado/backend/internal/http/middleware"
)

type Deps struct {
	// Filled in as features land. Empty for skeleton.
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(mw.Recover)
	r.Use(mw.Logger)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	return r
}
