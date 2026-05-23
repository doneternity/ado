package proxy

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	dialTimeout           = 5 * time.Second
	responseHeaderTimeout = 120 * time.Second
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
		Client: &http.Client{
			Timeout: 0,
			Transport: &http.Transport{
				DialContext:           (&net.Dialer{Timeout: dialTimeout}).DialContext,
				ResponseHeaderTimeout: responseHeaderTimeout,
				ForceAttemptHTTP2:     true,
				MaxIdleConns:          100,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   10 * time.Second,
				ExpectContinueTimeout: time.Second,
			},
		},
	}
}

func (f *Forwarder) do(r *http.Request, path string, body []byte) (*http.Response, error) {
	upstreamURL := f.BaseURL + path
	if r.URL.RawQuery != "" {
		upstreamURL += "?" + r.URL.RawQuery
	}
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL, bodyReader)
	if err != nil {
		return nil, err
	}
	skip := skipRequestHeaders(r.Header)
	for k, vs := range r.Header {
		if skip[http.CanonicalHeaderKey(k)] {
			continue
		}
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	req.Header.Set("Authorization", "Bearer "+f.APIKey)
	return f.Client.Do(req)
}

func (r *Registry) Forward(w http.ResponseWriter, req *http.Request, path string, body []byte) (started bool, err error) {
	chain := r.Get()
	if len(chain) == 0 {
		return false, errors.New("no provider configured")
	}
	var lastErr error
	for _, f := range chain {
		resp, derr := f.do(req, path, body)
		if derr != nil {
			lastErr = derr
			continue
		}
		if isFailoverStatus(resp.StatusCode) {
			lastErr = fmt.Errorf("provider returned %d", resp.StatusCode)
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			continue
		}
		return true, streamResponse(w, resp)
	}
	return false, lastErr
}

// AggregateModels queries all providers concurrently and merges their model
// lists into a single deduplicated response. Providers that fail are silently
// skipped so a partial list is returned rather than an error.
func (r *Registry) AggregateModels(w http.ResponseWriter, req *http.Request) error {
	chain := r.Get()
	if len(chain) == 0 {
		return errors.New("no provider configured")
	}

	type modelItem = map[string]any
	results := make([][]modelItem, len(chain))
	var wg sync.WaitGroup
	for i, f := range chain {
		wg.Add(1)
		go func(idx int, fwd *Forwarder) {
			defer wg.Done()
			resp, err := fwd.do(req, "/models", nil)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return
			}
			var body struct {
				Data []modelItem `json:"data"`
			}
			if json.NewDecoder(resp.Body).Decode(&body) == nil {
				results[idx] = body.Data
			}
		}(i, f)
	}
	wg.Wait()

	seen := make(map[string]bool)
	all := make([]modelItem, 0)
	for _, list := range results {
		for _, m := range list {
			id, _ := m["id"].(string)
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			all = append(all, m)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": all})
}

func isFailoverStatus(code int) bool {
	// 401/403 mean the provider's own key is invalid — try the next provider.
	// 429 and 5xx mean overloaded/down — same.
	return code >= 500 || code == http.StatusTooManyRequests ||
		code == http.StatusUnauthorized || code == http.StatusForbidden
}

func streamResponse(w http.ResponseWriter, resp *http.Response) error {
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

func skipRequestHeaders(h http.Header) map[string]bool {
	skip := map[string]bool{"Cookie": true}
	for name := range hopByHop {
		skip[name] = true
	}
	for _, v := range h.Values("Connection") {
		for _, token := range strings.Split(v, ",") {
			if t := strings.TrimSpace(token); t != "" {
				skip[http.CanonicalHeaderKey(t)] = true
			}
		}
	}
	return skip
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
