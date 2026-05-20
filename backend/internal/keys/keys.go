package keys

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
)

const keyAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
const keyRandomLen = 32

// Generate produces a fresh ADO key: "ado-" followed by 32 random
// alphanumeric characters, plus its display prefix and sha256 hash.
func Generate() (raw, prefix string, hash []byte, err error) {
	body, err := randomAlphanumeric(keyRandomLen)
	if err != nil {
		return "", "", nil, err
	}
	raw = "ado-" + body
	prefix = "ado-" + body[:8]
	sum := sha256.Sum256([]byte(raw))
	return raw, prefix, sum[:], nil
}

// randomAlphanumeric returns n characters drawn uniformly from keyAlphabet.
// Bytes that would introduce modulo bias are rejected so every character is
// equally likely.
func randomAlphanumeric(n int) (string, error) {
	// Largest multiple of the alphabet size that fits in a byte; bytes at or
	// above this are discarded to keep the distribution uniform.
	const maxUnbiased = 256 - (256 % len(keyAlphabet))
	out := make([]byte, n)
	buf := make([]byte, n)
	for i := 0; i < n; {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, b := range buf {
			if int(b) >= maxUnbiased {
				continue
			}
			out[i] = keyAlphabet[int(b)%len(keyAlphabet)]
			i++
			if i == n {
				break
			}
		}
	}
	return string(out), nil
}

func Hash(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func HashMatches(raw string, want []byte) bool {
	got := Hash(raw)
	return subtle.ConstantTimeCompare(got, want) == 1
}
