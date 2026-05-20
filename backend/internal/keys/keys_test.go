package keys

import (
	"strings"
	"testing"
)

func TestGenerate_Format(t *testing.T) {
	raw, prefix, hash, err := Generate()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(raw, "ado-") {
		t.Fatalf("raw=%q must start with ado-", raw)
	}
	if len(raw) != 4+32 {
		t.Fatalf("raw len=%d, want 36", len(raw))
	}
	if !strings.HasPrefix(prefix, "ado-") || len(prefix) != 4+8 {
		t.Fatalf("prefix=%q", prefix)
	}
	if len(hash) != 32 {
		t.Fatalf("hash len=%d, want 32", len(hash))
	}
	body := strings.TrimPrefix(raw, "ado-")
	for _, c := range body {
		isAlphanumeric := (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
		if !isAlphanumeric {
			t.Fatalf("raw body contains non-alphanumeric char %q", c)
		}
	}
}

func TestGenerate_Unique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		raw, _, _, err := Generate()
		if err != nil {
			t.Fatal(err)
		}
		if seen[raw] {
			t.Fatalf("duplicate key generated: %q", raw)
		}
		seen[raw] = true
	}
}

func TestGenerate_HashMatches(t *testing.T) {
	raw, _, hash, _ := Generate()
	if !HashMatches(raw, hash) {
		t.Fatal("hash mismatch")
	}
	if HashMatches("ado-bogus", hash) {
		t.Fatal("expected mismatch on wrong key")
	}
}
