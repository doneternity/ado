package proxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	pingTimeout = 15 * time.Second
	// monitorDownThreshold is how many consecutive failed checks mark a provider
	// down, so one flaky check doesn't page anyone.
	monitorDownThreshold = 2
)

// Ping checks that the provider answers GET /models with a 200.
func (f *Forwarder) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.BaseURL+"/models", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+f.APIKey)
	resp, err := f.Client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET /models returned %d", resp.StatusCode)
	}
	return nil
}

// ProviderMonitor periodically pings every provider in the chain and calls
// notify on state changes only: a provider going down, coming back, or the
// chain being empty. It never repeats an alert for an unchanged state.
type ProviderMonitor struct {
	reg    *Registry
	notify func(msg string)

	fails       map[string]int  // consecutive failed checks per base URL
	down        map[string]bool // providers currently reported down
	emptyNotice bool            // "no providers configured" already sent
}

func NewProviderMonitor(reg *Registry, notify func(msg string)) *ProviderMonitor {
	return &ProviderMonitor{
		reg:    reg,
		notify: notify,
		fails:  make(map[string]int),
		down:   make(map[string]bool),
	}
}

// Check runs one round of pings. Not safe for concurrent use; call it from a
// single goroutine.
func (m *ProviderMonitor) Check(ctx context.Context) {
	chain := m.reg.Get()
	if len(chain) == 0 {
		if !m.emptyNotice {
			m.notify("No active LLM providers are configured, so every /v1 request fails. Add one at /admin/providers.")
			m.emptyNotice = true
		}
		return
	}
	m.emptyNotice = false

	errs := make([]error, len(chain))
	var wg sync.WaitGroup
	for i, f := range chain {
		wg.Add(1)
		go func(i int, f *Forwarder) {
			defer wg.Done()
			errs[i] = f.Ping(ctx)
		}(i, f)
	}
	wg.Wait()
	if ctx.Err() != nil {
		return // shutting down; results are meaningless
	}

	var wentDown, recovered []string
	seen := make(map[string]bool, len(chain))
	for i, f := range chain {
		url := f.Name() // one entry per key, so a single dead key is reported
		seen[url] = true
		if errs[i] == nil {
			m.fails[url] = 0
			if m.down[url] {
				delete(m.down, url)
				recovered = append(recovered, url)
			}
			continue
		}
		m.fails[url]++
		if m.fails[url] == monitorDownThreshold {
			m.down[url] = true
			wentDown = append(wentDown, fmt.Sprintf("%s (%v)", url, errs[i]))
		}
	}
	// forget providers removed from the chain.
	for url := range m.fails {
		if !seen[url] {
			delete(m.fails, url)
			delete(m.down, url)
		}
	}

	if len(wentDown) == 0 && len(recovered) == 0 {
		return
	}
	var b strings.Builder
	if len(wentDown) > 0 {
		if len(m.down) == len(chain) {
			b.WriteString("All LLM providers are down, so /v1 requests will fail.\n")
		}
		b.WriteString("Provider down: " + strings.Join(wentDown, ", ") + "\n")
	}
	if len(recovered) > 0 {
		b.WriteString("Provider recovered: " + strings.Join(recovered, ", ") + "\n")
	}
	b.WriteString("Manage providers at /admin/providers.")
	m.notify(b.String())
}
