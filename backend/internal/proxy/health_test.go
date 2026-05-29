package proxy

import "testing"

func TestModelHealth_Status(t *testing.T) {
	h := NewModelHealth()

	if got := h.Status("unseen"); got != "" {
		t.Fatalf("unseen model: want empty status, got %q", got)
	}

	// Two consecutive failures with no success -> down.
	h.Record("m", false)
	h.Record("m", false)
	if got := h.Status("m"); got != "down" {
		t.Fatalf("after 2 fails: want down, got %q", got)
	}

	// A success clears it back to available.
	h.Record("m", true)
	if got := h.Status("m"); got != "available" {
		t.Fatalf("after success: want available, got %q", got)
	}

	// A failure after a recent success is degraded, not down.
	h.Record("m", false)
	if got := h.Status("m"); got != "degraded" {
		t.Fatalf("recent ok + recent fail: want degraded, got %q", got)
	}

	// A single failure on a fresh model (no prior success) is degraded until it
	// crosses the down threshold.
	h.Record("solo", false)
	if got := h.Status("solo"); got != "degraded" {
		t.Fatalf("single fail: want degraded, got %q", got)
	}
}
