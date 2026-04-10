package mailer

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestConsole_WritesLink(t *testing.T) {
	var buf bytes.Buffer
	m := NewConsole(&buf)
	if err := m.SendVerification(context.Background(), "alice@example.com", "https://x/verify?token=abc"); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "alice@example.com") || !strings.Contains(out, "abc") {
		t.Fatalf("missing fields in output: %q", out)
	}
}
