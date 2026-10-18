// Package alert sends operator notifications to a Discord webhook.
package alert

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// discordMaxContent is Discord's message length limit.
const discordMaxContent = 2000

type Discord struct {
	url    string
	client *http.Client
}

// NewDiscord returns a notifier for the given webhook URL. An empty URL gives a
// notifier whose Send is a no-op, so callers don't need to branch.
func NewDiscord(webhookURL string) *Discord {
	return &Discord{url: webhookURL, client: &http.Client{Timeout: 10 * time.Second}}
}

func (d *Discord) Enabled() bool { return d.url != "" }

func (d *Discord) Send(ctx context.Context, msg string) error {
	if !d.Enabled() {
		return nil
	}
	if r := []rune(msg); len(r) > discordMaxContent {
		msg = string(r[:discordMaxContent-1]) + "…"
	}
	body, err := json.Marshal(map[string]string{"content": msg})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("discord webhook returned %d", resp.StatusCode)
	}
	return nil
}
