package config

import (
	"fmt"

	"github.com/caarlos0/env/v10"
)

type Config struct {
	AppEnv     string `env:"APP_ENV"      envDefault:"production"`
	AppBaseURL string `env:"APP_BASE_URL" envDefault:"http://localhost:8080"`
	Port       string `env:"PORT"         envDefault:"8081"`
	LogLevel   string `env:"LOG_LEVEL"    envDefault:"info"`

	DatabaseURL string `env:"DATABASE_URL,required"`
	RedisURL    string `env:"REDIS_URL,required"`

	SessionCookieSecure bool `env:"SESSION_COOKIE_SECURE"  envDefault:"true"`
	SessionIdleDays     int  `env:"SESSION_IDLE_DAYS"      envDefault:"7"`
	SessionAbsoluteDays int  `env:"SESSION_ABSOLUTE_DAYS"  envDefault:"30"`

	DiscordClientID     string `env:"DISCORD_CLIENT_ID"`
	DiscordClientSecret string `env:"DISCORD_CLIENT_SECRET"`
	DiscordRedirectURL  string `env:"DISCORD_REDIRECT_URL"`
	DiscordGuildID      string `env:"DISCORD_GUILD_ID"      envDefault:"1506040288182014043"`
	DiscordMemberRoleID string `env:"DISCORD_MEMBER_ROLE_ID"`

	FrontendOrigin string `env:"FRONTEND_ORIGIN" envDefault:""`

	Mailer       string `env:"MAILER" envDefault:"console"`
	ResendAPIKey string `env:"RESEND_API_KEY"`
	MailFrom     string `env:"MAIL_FROM"`

	ProviderKeySecret string `env:"PROVIDER_KEY_SECRET,required"`

	AdminBootstrapEmail string `env:"ADMIN_BOOTSTRAP_EMAIL"`

	// Background model health probing. Interval 0 disables active probing
	// (passive tracking from real traffic still runs).
	ModelProbeInterval int `env:"MODEL_PROBE_INTERVAL_SECONDS" envDefault:"90"`
	ModelProbeBatch    int `env:"MODEL_PROBE_BATCH"           envDefault:"2"`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	if cfg.Mailer == "resend" {
		if cfg.ResendAPIKey == "" {
			return nil, fmt.Errorf("config: MAILER=resend requires RESEND_API_KEY")
		}
		if cfg.MailFrom == "" {
			return nil, fmt.Errorf("config: MAILER=resend requires MAIL_FROM")
		}
	}
	if cfg.DiscordClientID != "" {
		if cfg.DiscordClientSecret == "" {
			return nil, fmt.Errorf("config: DISCORD_CLIENT_ID set but DISCORD_CLIENT_SECRET is empty")
		}
		if cfg.DiscordRedirectURL == "" {
			return nil, fmt.Errorf("config: DISCORD_CLIENT_ID set but DISCORD_REDIRECT_URL is empty")
		}
	}
	if len(cfg.ProviderKeySecret) < 32 {
		return nil, fmt.Errorf("config: PROVIDER_KEY_SECRET must be at least 32 bytes")
	}
	return cfg, nil
}
