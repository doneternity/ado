package auth

import "testing"

func TestCrossSite(t *testing.T) {
	for _, c := range []struct {
		frontend, api string
		want          bool
	}{
		{"https://adoai.space", "https://adoai.space/api/auth/discord/callback", false},
		{"http://localhost:5173", "http://localhost:8080/api/auth/discord/callback", false}, // ports don't make another site
		{"https://adoai.space", "https://api.example.com/api/auth/discord/callback", true},
		{"https://adoai.space", "", true}, // unknown: keep SameSite=None
		{"", "https://adoai.space/cb", false},
	} {
		if got := CrossSite(c.frontend, c.api); got != c.want {
			t.Errorf("CrossSite(%q, %q) = %v, want %v", c.frontend, c.api, got, c.want)
		}
	}
}

func TestHashToken(t *testing.T) {
	token := []byte("0123456789abcdef0123456789abcdef")
	h := hashToken(token)
	if len(h) != 32 || string(h) == string(token) || string(hashToken(token)) != string(h) {
		t.Fatal("hashToken should be a stable 32-byte digest, not the token")
	}
}
