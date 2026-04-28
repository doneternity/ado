package oauth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"
	googleo "golang.org/x/oauth2/google"
)

type Google struct {
	cfg      oauth2.Config
	verifier *oidc.IDTokenVerifier
	rdb      *redis.Client
}

type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

func NewGoogle(ctx context.Context, c Config, rdb *redis.Client) (*Google, error) {
	provider, err := oidc.NewProvider(ctx, "https://accounts.google.com")
	if err != nil {
		return nil, fmt.Errorf("oidc provider: %w", err)
	}
	return &Google{
		cfg: oauth2.Config{
			ClientID:     c.ClientID,
			ClientSecret: c.ClientSecret,
			RedirectURL:  c.RedirectURL,
			Endpoint:     googleo.Endpoint,
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: c.ClientID}),
		rdb:      rdb,
	}, nil
}

// AuthURL generates state+nonce, stores them in Redis (10m TTL), returns the URL.
func (g *Google) AuthURL(ctx context.Context) (string, error) {
	state, err := randURL(32)
	if err != nil {
		return "", err
	}
	nonce, err := randURL(32)
	if err != nil {
		return "", err
	}
	if err := g.rdb.Set(ctx, "oauth_state:"+state, nonce, 10*time.Minute).Err(); err != nil {
		return "", err
	}
	return g.cfg.AuthCodeURL(state,
		oauth2.SetAuthURLParam("nonce", nonce),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	), nil
}

type Identity struct {
	Sub           string
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

var (
	ErrInvalidState    = errors.New("invalid oauth state")
	ErrEmailUnverified = errors.New("google email not verified")
)

// Exchange validates state (one-shot via GETDEL), exchanges the code, and verifies the ID token.
func (g *Google) Exchange(ctx context.Context, code, state string) (Identity, error) {
	expectedNonce, err := g.rdb.GetDel(ctx, "oauth_state:"+state).Result()
	if err == redis.Nil || expectedNonce == "" {
		return Identity{}, ErrInvalidState
	}
	if err != nil {
		return Identity{}, err
	}

	tok, err := g.cfg.Exchange(ctx, code)
	if err != nil {
		return Identity{}, fmt.Errorf("token exchange: %w", err)
	}
	rawID, _ := tok.Extra("id_token").(string)
	if rawID == "" {
		return Identity{}, errors.New("no id_token in response")
	}
	idTok, err := g.verifier.Verify(ctx, rawID)
	if err != nil {
		return Identity{}, fmt.Errorf("verify id_token: %w", err)
	}
	if idTok.Nonce != expectedNonce {
		return Identity{}, errors.New("nonce mismatch")
	}

	var claims struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := idTok.Claims(&claims); err != nil {
		return Identity{}, err
	}
	if !claims.EmailVerified {
		return Identity{}, ErrEmailUnverified
	}
	return Identity{
		Sub: claims.Sub, Email: claims.Email, EmailVerified: claims.EmailVerified,
		Name: claims.Name, Picture: claims.Picture,
	}, nil
}

func randURL(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
