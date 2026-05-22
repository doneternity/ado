package keyencrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
)

const prefix = "enc:"

// deriveKey hashes the secret with SHA-256 to produce a 32-byte AES-256 key.
func deriveKey(secret string) []byte {
	sum := sha256.Sum256([]byte(secret))
	return sum[:]
}

// Encrypt returns an "enc:<base64>" string. If secret is empty the plaintext
// is returned unchanged (raw provider key stored in DB) — PROVIDER_KEY_SECRET
// must always be set; config.Load() now enforces this at startup.
//
// AES-256-GCM: key derived via SHA-256(secret). Each call generates a fresh
// 12-byte random nonce (OWASP: never reuse a nonce with the same key).
// The GCM authentication tag (16 bytes, appended by Seal) ensures ciphertext
// integrity — any tampering causes Decrypt to fail.
func Encrypt(plaintext, secret string) (string, error) {
	if secret == "" {
		return plaintext, nil
	}
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	// crypto/rand provides a CSPRNG nonce; nonce is prepended to the ciphertext.
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return prefix + base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

// Decrypt handles both "enc:<base64>" values and legacy plaintext values.
// If the value is not prefixed with "enc:" it is returned as-is.
func Decrypt(val, secret string) (string, error) {
	if !strings.HasPrefix(val, prefix) {
		return val, nil
	}
	if secret == "" {
		return "", fmt.Errorf("keyencrypt: value is encrypted but PROVIDER_KEY_SECRET is not set")
	}
	data, err := base64.RawURLEncoding.DecodeString(val[len(prefix):])
	if err != nil {
		return "", fmt.Errorf("keyencrypt: decode: %w", err)
	}
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", fmt.Errorf("keyencrypt: ciphertext too short")
	}
	nonce, ct := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("keyencrypt: decrypt: %w", err)
	}
	return string(plain), nil
}
