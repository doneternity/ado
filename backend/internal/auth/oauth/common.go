package oauth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
)

var ErrInvalidState = errors.New("invalid oauth state")

func randURL(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
