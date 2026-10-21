package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/ado/ado/backend/internal/apperr"
)

// publicPath is the address a caller used: the website proxies /v1/* to
// /api/v1/*, so API paths are shown without the /api.
func publicPath(r *http.Request) string {
	if p := strings.TrimPrefix(r.URL.Path, "/api"); strings.HasPrefix(p, "/v1") {
		return p
	}
	return r.URL.Path
}

// APINotFound answers a /v1 address that isn't an endpoint, with a hint for
// the usual mistakes (a base URL that doubles /v1, a full chat address where
// an app wants the base URL, the old completions endpoint).
func APINotFound(w http.ResponseWriter, r *http.Request) {
	p := publicPath(r)
	apperr.Write(w, apperr.NotFound("NOT_FOUND", fmt.Sprintf("there's no %s %s endpoint; %s", r.Method, p, apiPathHint(p))))
}

func apiPathHint(p string) string {
	switch {
	case strings.Contains(p, "/v1/v1"):
		return "the address has /v1 twice: set the base URL to https://adoai.space/v1 and let your app add the rest"
	case strings.HasPrefix(p, "/v1/chat/completions/"):
		return "the address has more after /chat/completions: this app wants the base URL, https://adoai.space/v1, not the full chat address"
	case p == "/v1/completions":
		return "ADO doesn't serve the older text completions endpoint: use POST /v1/chat/completions"
	case p == "/v1/chat/completion" || p == "/v1/chat" || p == "/v1/completion":
		return "did you mean POST /v1/chat/completions?"
	case p == "/v1" || p == "/v1/":
		return "this is the base URL: add an endpoint to it, like POST /v1/chat/completions"
	default:
		return "see https://adoai.space/docs for ADO's endpoints"
	}
}

// APIMethodNotAllowed answers a /v1 endpoint called with the wrong method.
// /models and /realtime are GET; every other endpoint is POST.
func APIMethodNotAllowed(w http.ResponseWriter, r *http.Request) {
	p := publicPath(r)
	want := http.MethodPost
	if p == "/v1/models" || p == "/v1/realtime" {
		want = http.MethodGet
	}
	w.Header().Set("Allow", want)
	apperr.Write(w, apperr.New(http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED",
		fmt.Sprintf("%s %s isn't supported; send a %s request", r.Method, p, want)))
}

// MissingV1 answers API calls sent to the site's root instead of /v1 (a base
// URL of https://adoai.space). The website routes them here.
func MissingV1(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/missing-v1")
	apperr.Write(w, apperr.NotFound("NOT_FOUND", fmt.Sprintf(
		"this address is missing /v1: use https://adoai.space/v1%s (the base URL is https://adoai.space/v1)", rest)))
}

// NotFound answers any other unknown /api address with JSON, not plain text.
func NotFound(w http.ResponseWriter, r *http.Request) {
	apperr.Write(w, apperr.NotFound("NOT_FOUND", fmt.Sprintf("there's nothing at %s %s", r.Method, r.URL.Path)))
}

// MethodNotAllowed is NotFound for a known address called with the wrong method.
func MethodNotAllowed(w http.ResponseWriter, r *http.Request) {
	apperr.Write(w, apperr.New(http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED",
		fmt.Sprintf("%s isn't supported on %s", r.Method, r.URL.Path)))
}
