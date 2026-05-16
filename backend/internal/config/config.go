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

	GoogleOAuthClientID     string `env:"GOOGLE_OAUTH_CLIENT_ID"`
	GoogleOAuthClientSecret string `env:"GOOGLE_OAUTH_CLIENT_SECRET"`
	GoogleOAuthRedirectURL  string `env:"GOOGLE_OAUTH_REDIRECT_URL"`

	FrontendOrigin string `env:"FRONTEND_ORIGIN" envDefault:""`

	GeminiAPIKey  string `env:"GEMINI_API_KEY"`
	GeminiBaseURL string `env:"GEMINI_BASE_URL" envDefault:"https://generativelanguage.googleapis.com/v1beta/openai"`

	Mailer       string `env:"MAILER" envDefault:"console"`
	ResendAPIKey string `env:"RESEND_API_KEY"`
	MailFrom     string `env:"MAIL_FROM,required"`

	AdminBootstrapEmail string `env:"ADMIN_BOOTSTRAP_EMAIL"`
}

func Load() (*Config, error) {
	cfg := &Config{}
	if err := env.Parse(cfg); err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	if cfg.Mailer == "resend" && cfg.ResendAPIKey == "" {
		return nil, fmt.Errorf("config: MAILER=resend requires RESEND_API_KEY")
	}
	return cfg, nil
}
