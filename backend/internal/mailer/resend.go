package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type resend struct {
	apiKey string
	from   string
	hc     *http.Client
}

func NewResend(apiKey, from string) Mailer {
	return &resend{apiKey: apiKey, from: from, hc: &http.Client{Timeout: 10 * time.Second}}
}

func (r *resend) SendVerification(ctx context.Context, to, link string) error {
	body := map[string]any{
		"from":    r.from,
		"to":      []string{to},
		"subject": "Verify your ADO email",
		"html": fmt.Sprintf(
			`<p>Welcome to ADO. Click to verify:</p><p><a href="%s">%s</a></p><p>Link expires in 24h.</p>`,
			link, link),
	}
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.resend.com/emails", bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend: HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}
