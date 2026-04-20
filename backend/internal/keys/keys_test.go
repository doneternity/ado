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
