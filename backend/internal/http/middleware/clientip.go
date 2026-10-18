package middleware

import (
	"net"
	"net/http"
	"strings"
)

// Requests reach the backend through proxies (Vercel's rewrite, then Koyeb's
// edge), each of which may append to X-Forwarded-For. Which entry is the real
// visitor depends on that chain, so it is configured rather than guessed; the
// admin request-info endpoint shows what actually arrives.
var (
	// clientIPHeader, if set and present, is used verbatim (first value).
	// Only point it at a header a trusted proxy overwrites.
	clientIPHeader string
	// trustedHops is how many proxies append to X-Forwarded-For; the client
	// is that many entries from the right. Entries further left are supplied
	// by the client and can't be trusted.
	trustedHops = 1
)

// ConfigureClientIP sets how ClientIP resolves addresses. Call it once at
// startup, before serving.
func ConfigureClientIP(header string, hops int) {
	clientIPHeader = strings.TrimSpace(header)
	if hops < 1 {
		hops = 1
	}
	trustedHops = hops
}

// ClientIP returns the visitor's IP as configured by ConfigureClientIP.
func ClientIP(r *http.Request) string {
	if clientIPHeader != "" {
		if v := firstListValue(r.Header.Get(clientIPHeader)); v != "" {
			return v
		}
	}
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		var parts []string
		for _, p := range strings.Split(xf, ",") {
			if p = strings.TrimSpace(p); p != "" {
				parts = append(parts, p)
			}
		}
		if len(parts) > 0 {
			i := len(parts) - trustedHops
			if i < 0 {
				i = 0
			}
			return parts[i]
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func firstListValue(v string) string {
	if i := strings.IndexByte(v, ','); i >= 0 {
		v = v[:i]
	}
	return strings.TrimSpace(v)
}
