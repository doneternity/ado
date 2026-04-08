package config

import (
	"os"
	"testing"
)

func TestLoad_RequiredVarsMissing(t *testing.T) {
	os.Clearenv()
	if _, err := Load(); err == nil {
		t.Fatal("expected error when DATABASE_URL missing, got nil")
	}
}

func TestLoad_AllRequiredPresent(t *testing.T) {
	os.Clearenv()
	os.Setenv("APP_ENV", "development")
	os.Setenv("APP_BASE_URL", "http://localhost:8080")
	os.Setenv("PORT", "8081")
	os.Setenv("DATABASE_URL", "postgres://x")
	os.Setenv("REDIS_URL", "redis://y")
	os.Setenv("MAILER", "console")
	os.Setenv("MAIL_FROM", "ADO <noreply@example.com>")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.Port != "8081" {
		t.Fatalf("Port=%q, want 8081", cfg.Port)
	}
	if cfg.SessionIdleDays != 7 {
		t.Fatalf("default SessionIdleDays=%d, want 7", cfg.SessionIdleDays)
	}
}
