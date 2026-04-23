package proxy

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type Forwarder struct {
	BaseURL string
	APIKey  string
	Client  *http.Client
}

func New(baseURL, apiKey string) *Forwarder {
	return &Forwarder{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Client:  &http.Client{Timeout: 0}, // streaming-friendly
	}
}

// Forward proxies the incoming request to upstream path (e.g. "/chat/completions").
func (f *Forwarder) Forward(w http.ResponseWriter, r *http.Request, path string) error {
	upstreamURL := f.BaseURL + path
	if r.URL.RawQuery != "" {
		upstreamURL += "?" + r.URL.RawQuery
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL, r.Body)
	if err != nil {
		return err
	}

	// Copy non-hop-by-hop headers, then override Authorization.
	for k, vs := range r.Header {
		if isHopByHop(k) {
			continue
		}
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	req.Header.Set("Authorization", "Bearer "+f.APIKey)

	resp, err := f.Client.Do(req)
	if err != nil {
		return fmt.Errorf("upstream: %w", err)
	}
	defer resp.Body.Close()

	for k, vs := range resp.Header {
		if isHopByHop(k) {
			continue
		}
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	flusher, _ := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return werr
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
		if errors.Is(rerr, io.EOF) {
			return nil
		}
		if rerr != nil {
			return rerr
		}
	}
}

var hopByHop = map[string]struct{}{
	"Connection": {}, "Keep-Alive": {}, "Proxy-Authenticate": {},
	"Proxy-Authorization": {}, "Te": {}, "Trailer": {},
	"Transfer-Encoding": {}, "Upgrade": {},
}

func isHopByHop(k string) bool {
	_, ok := hopByHop[http.CanonicalHeaderKey(k)]
	return ok
}
