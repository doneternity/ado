package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	discordAuthURL  = "https://discord.com/oauth2/authorize"
	discordTokenURL = "https://discord.com/api/oauth2/token"
	discordAPIBase  = "https://discord.com/api/v10"
)

// timeout so a slow discord cannot pin a request goroutine
var httpClient = &http.Client{Timeout: 10 * time.Second}

type Discord struct {
	clientID     string
	clientSecret string
	redirectURL  string
	rdb          *redis.Client
}

type DiscordConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

func NewDiscord(c DiscordConfig, rdb *redis.Client) *Discord {
	return &Discord{
		clientID:     c.ClientID,
		clientSecret: c.ClientSecret,
		redirectURL:  c.RedirectURL,
		rdb:          rdb,
	}
}

// AuthURL generates a state token, stores it in Redis (10m TTL), and returns
// the Discord authorization URL and the state token.
func (d *Discord) AuthURL(ctx context.Context) (authURL, state string, err error) {
	state, err = randURL(32)
	if err != nil {
		return "", "", err
	}
	if err := d.rdb.Set(ctx, "oauth_state:discord:"+state, "1", 10*time.Minute).Err(); err != nil {
		return "", "", err
	}
	params := url.Values{
		"client_id":     {d.clientID},
		"redirect_uri":  {d.redirectURL},
		"response_type": {"code"},
		"scope":         {"identify email guilds"},
		"state":         {state},
	}
	return discordAuthURL + "?" + params.Encode(), state, nil
}

// DiscordIdentity holds the user info returned by GET /users/@me.
type DiscordIdentity struct {
	ID       string
	Email    string
	Username string
	Avatar   string // hash — build full URL with AvatarURL()
	Verified bool   // email verified by discord
}

// AvatarURL returns the CDN URL for the user's avatar, or empty string if none.
func (i DiscordIdentity) AvatarURL() string {
	if i.Avatar == "" {
		return ""
	}
	return fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.png", i.ID, i.Avatar)
}

// DiscordGuild is a partial guild object from GET /users/@me/guilds.
type DiscordGuild struct {
	ID string `json:"id"`
}

// Exchange validates the state (one-shot via GETDEL), exchanges the code for
// an access token, and fetches the user identity + guild list.
func (d *Discord) Exchange(ctx context.Context, code, state string) (DiscordIdentity, []DiscordGuild, error) {
	val, err := d.rdb.GetDel(ctx, "oauth_state:discord:"+state).Result()
	if err == redis.Nil || val == "" {
		return DiscordIdentity{}, nil, ErrInvalidState
	}
	if err != nil {
		return DiscordIdentity{}, nil, err
	}

	accessToken, err := d.exchangeCode(ctx, code)
	if err != nil {
		return DiscordIdentity{}, nil, fmt.Errorf("discord token exchange: %w", err)
	}

	ident, err := d.fetchIdentity(ctx, accessToken)
	if err != nil {
		return DiscordIdentity{}, nil, fmt.Errorf("discord identity: %w", err)
	}

	guilds, err := d.fetchGuilds(ctx, accessToken)
	if err != nil {
		return DiscordIdentity{}, nil, fmt.Errorf("discord guilds: %w", err)
	}

	return ident, guilds, nil
}

func (d *Discord) exchangeCode(ctx context.Context, code string) (string, error) {
	body := url.Values{
		"client_id":     {d.clientID},
		"client_secret": {d.clientSecret},
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {d.redirectURL},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, discordTokenURL,
		strings.NewReader(body.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("discord token endpoint returned %d", resp.StatusCode)
	}

	var tok struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", err
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("empty access_token from discord")
	}
	return tok.AccessToken, nil
}

func (d *Discord) fetchIdentity(ctx context.Context, accessToken string) (DiscordIdentity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discordAPIBase+"/users/@me", nil)
	if err != nil {
		return DiscordIdentity{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return DiscordIdentity{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return DiscordIdentity{}, fmt.Errorf("discord /users/@me returned %d", resp.StatusCode)
	}

	var u struct {
		ID       string `json:"id"`
		Email    string `json:"email"`
		Name     string `json:"username"`
		Avatar   string `json:"avatar"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return DiscordIdentity{}, err
	}
	if u.ID == "" {
		return DiscordIdentity{}, fmt.Errorf("discord account has no user ID")
	}
	if u.Email == "" {
		return DiscordIdentity{}, fmt.Errorf("discord account has no email address")
	}
	return DiscordIdentity{ID: u.ID, Email: u.Email, Username: u.Name, Avatar: u.Avatar, Verified: u.Verified}, nil
}

func (d *Discord) fetchGuilds(ctx context.Context, accessToken string) ([]DiscordGuild, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discordAPIBase+"/users/@me/guilds", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("discord /users/@me/guilds returned %d", resp.StatusCode)
	}

	var guilds []DiscordGuild
	if err := json.NewDecoder(resp.Body).Decode(&guilds); err != nil {
		return nil, err
	}
	return guilds, nil
}
