package alert

import (
	"strings"
	"testing"
	"time"
)

func TestErrorSpike(t *testing.T) {
	var sent []string
	s := &ErrorSpike{
		ServerThreshold:   10,
		FrontendThreshold: 5,
		Cooldown:          time.Hour,
		Send:              func(msg string) { sent = append(sent, msg) },
	}
	const window = 5 * time.Minute
	t0 := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

	if s.Observe(t0, window, 9, 4) {
		t.Fatal("alerted below both thresholds")
	}
	if !s.Observe(t0, window, 10, 0) {
		t.Fatal("no alert at the server threshold")
	}
	if !strings.Contains(sent[0], "10 server errors and 0 website crashes in the last 5 minutes") {
		t.Fatalf("unexpected message: %q", sent[0])
	}
	if s.Observe(t0.Add(30*time.Minute), window, 50, 50) {
		t.Fatal("alerted again inside the cooldown")
	}
	if !s.Observe(t0.Add(61*time.Minute), window, 0, 5) {
		t.Fatal("no alert at the frontend threshold after the cooldown")
	}
	if len(sent) != 2 {
		t.Fatalf("sent %d alerts, want 2", len(sent))
	}
}
