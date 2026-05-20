package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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

const verifyEmailHTML = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background-color:#050508;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#050508;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background-color:#0e0e14;border:1px solid #22222b;border-radius:16px;">
          <tr><td style="padding:36px 36px 0;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px;">ADO</div>
          </td></tr>
          <tr><td style="padding:22px 36px 0;">
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:normal;color:#ffffff;line-height:1.25;">Verify your email</h1>
          </td></tr>
          <tr><td style="padding:14px 36px 0;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#9a9aa3;">Welcome to ADO &mdash; one key for every model. Confirm your email address to activate your account and get your API key.</p>
          </td></tr>
          <tr><td style="padding:28px 36px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="center" style="border-radius:999px;background-color:#ffffff;padding:13px 34px;">
                <a href="{{LINK}}" style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:#050508;text-decoration:none;">Verify email</a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:26px 36px 0;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5f5f68;">Or paste this link into your browser:</p>
            <p style="margin:6px 0 0;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{{LINK}}" style="color:#00b4ff;text-decoration:none;">{{LINK}}</a></p>
          </td></tr>
          <tr><td style="padding:24px 36px 36px;">
            <p style="margin:0;border-top:1px solid #1c1c24;padding-top:20px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5f5f68;">This link expires in 24 hours. If you didn&rsquo;t create an ADO account, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

const verifyEmailText = `Verify your email

Welcome to ADO — one key for every model. Confirm your email address to
activate your account and get your API key.

Verify your email:
{{LINK}}

This link expires in 24 hours. If you didn't create an ADO account, you
can safely ignore this email.`

func (r *resend) SendVerification(ctx context.Context, to, link string) error {
	body := map[string]any{
		"from":    r.from,
		"to":      []string{to},
		"subject": "Verify your ADO email",
		"html":    strings.ReplaceAll(verifyEmailHTML, "{{LINK}}", link),
		"text":    strings.ReplaceAll(verifyEmailText, "{{LINK}}", link),
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
