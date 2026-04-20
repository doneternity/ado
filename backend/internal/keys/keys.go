package keys

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
)

// Generate produces a fresh ADO key (raw, prefix, sha256 hash).
func Generate() (raw, prefix string, hash []byte, err error) {
	b := make([]byte, 16)
	if _, err = rand.Read(b); err != nil {
		return "", "", nil, err
	}
	hexed := hex.EncodeToString(b)
	raw = "ado-" + hexed
	prefix = "ado-" + hexed[:8]
	sum := sha256.Sum256([]byte(raw))
	return raw, prefix, sum[:], nil
}

func Hash(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func HashMatches(raw string, want []byte) bool {
	got := Hash(raw)
	return subtle.ConstantTimeCompare(got, want) == 1
}
