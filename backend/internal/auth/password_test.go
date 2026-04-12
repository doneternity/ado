package auth

import "testing"

func TestPassword_HashAndVerify(t *testing.T) {
	h, err := HashPassword("hunter2-correct-horse")
	if err != nil { t.Fatal(err) }
	if !VerifyPassword("hunter2-correct-horse", h) {
		t.Fatal("expected correct password to verify")
	}
	if VerifyPassword("wrong", h) {
		t.Fatal("expected wrong password to fail")
	}
}

func TestPassword_DifferentSaltsProduceDifferentHashes(t *testing.T) {
	h1, _ := HashPassword("same")
	h2, _ := HashPassword("same")
	if h1 == h2 { t.Fatal("expected different hashes from different salts") }
}
