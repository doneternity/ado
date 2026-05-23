package handlers

import (
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/auth/oauth"
	"github.com/ado/ado/backend/internal/config"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

type DiscordDeps struct {
	Cfg      *config.Config
	Q        *db.Queries
	Sessions *auth.Sessions
	Discord  *oauth.Discord
	Keys     *keys.Service
}

type DiscordHandler struct{ d DiscordDeps }

func NewDiscord(d DiscordDeps) *DiscordHandler { return &DiscordHandler{d: d} }

// binds the oauth callback to the browser that started the flow
const oauthStateCookie = "ado_oauth_state"

func (h *DiscordHandler) setStateCookie(w http.ResponseWriter, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    value,
		Path:     "/api/auth/discord",
		HttpOnly: true,
		Secure:   h.d.Cfg.SessionCookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
	})
}

func (h *DiscordHandler) Start(w http.ResponseWriter, r *http.Request) {
	authURL, state, err := h.d.Discord.AuthURL(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "auth url"))
		return
	}
	h.setStateCookie(w, state, 600)
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (h *DiscordHandler) Callback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "missing code/state"))
		return
	}

	// state must match the cookie set when the flow began
	stateCookie, cerr := r.Cookie(oauthStateCookie)
	if cerr != nil || subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(state)) != 1 {
		apperr.Write(w, apperr.BadRequest("INVALID_STATE", "invalid or expired state"))
		return
	}
	h.setStateCookie(w, "", -1)

	ident, member, err := h.d.Discord.Exchange(r.Context(), code, state)
	if errors.Is(err, oauth.ErrInvalidState) {
		apperr.Write(w, apperr.BadRequest("INVALID_STATE", "invalid or expired state"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "discord exchange"))
		return
	}

	// Guild membership + role gate.
	joinBase := h.d.Cfg.AppBaseURL
	if h.d.Cfg.FrontendOrigin != "" {
		joinBase = h.d.Cfg.FrontendOrigin
	}
	if !member.InGuild {
		http.Redirect(w, r, joinBase+"/join-required", http.StatusFound)
		return
	}
	if h.d.Cfg.DiscordMemberRoleID != "" && !hasRole(member.Roles, h.d.Cfg.DiscordMemberRoleID) {
		http.Redirect(w, r, joinBase+"/join-required", http.StatusFound)
		return
	}

	// an unverified email could match a victim's account (takeover)
	if !ident.Verified {
		apperr.Write(w, apperr.Forbidden("EMAIL_UNVERIFIED", "your Discord email address must be verified"))
		return
	}

	user, err := h.resolveUser(r, ident)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	if user.Banned {
		apperr.Write(w, apperr.Forbidden("BANNED", "account suspended"))
		return
	}

	sess, cookie, err := h.d.Sessions.Create(r.Context(), user.ID, r.UserAgent(), mw.ClientIP(r))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "session"))
		return
	}
	h.d.Sessions.SetCookie(w, cookie)
	if issued, _ := h.d.Keys.EnsureForUser(r.Context(), user.ID); issued.Raw != "" {
		_ = h.d.Keys.StashFlash(r.Context(), hex.EncodeToString(sess.ID), issued.Raw, issued.Prefix, issued.DailyLimit)
	}

	base := h.d.Cfg.AppBaseURL
	if h.d.Cfg.FrontendOrigin != "" {
		base = h.d.Cfg.FrontendOrigin
	}
	http.Redirect(w, r, base+"/dashboard", http.StatusFound)
}

// resolveUser finds or creates the user account for the Discord identity.
// Resolution order:
//  1. discord_id already in DB → update avatar/name, return existing user
//  2. Email match with verified user → link discord_id, return existing user
//  3. Email match with unverified user → delete stale row, create fresh
//  4. No match → create new user
func (h *DiscordHandler) resolveUser(r *http.Request, ident oauth.DiscordIdentity) (db.User, error) {
	ctx := r.Context()

	// 1. Existing Discord account.
	user, err := h.d.Q.GetUserByDiscordID(ctx, ptr(ident.ID))
	if err == nil {
		if lerr := h.d.Q.LinkDiscordID(ctx, db.LinkDiscordIDParams{
			ID:          user.ID,
			DiscordID:   ptr(ident.ID),
			PhotoUrl:    ident.AvatarURL(),
			DisplayName: ident.Username,
		}); lerr != nil {
			return db.User{}, apperr.Internal("INTERNAL", "link discord")
		}
		user.DiscordID = ptr(ident.ID)
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.User{}, apperr.Internal("INTERNAL", "lookup discord")
	}

	// 2 & 3. Email-based resolution.
	existing, eerr := h.d.Q.GetUserByEmail(ctx, strings.ToLower(ident.Email))
	if eerr != nil && !errors.Is(eerr, pgx.ErrNoRows) {
		return db.User{}, apperr.Internal("INTERNAL", "lookup email")
	}

	if eerr == nil {
		if existing.DiscordID != nil && *existing.DiscordID != ident.ID {
			return db.User{}, apperr.Conflict("EMAIL_LINKED_ELSEWHERE",
				"this email is already linked to another Discord account")
		}
		if existing.EmailVerified {
			// Safe to link.
			if lerr := h.d.Q.LinkDiscordID(ctx, db.LinkDiscordIDParams{
				ID:          existing.ID,
				DiscordID:   ptr(ident.ID),
				PhotoUrl:    ident.AvatarURL(),
				DisplayName: ident.Username,
			}); lerr != nil {
				return db.User{}, apperr.Internal("INTERNAL", "link discord")
			}
			existing.DiscordID = ptr(ident.ID)
			return existing, nil
		}
		// Unverified stale row — delete and fall through to create.
		if derr := h.d.Q.DeleteUser(ctx, existing.ID); derr != nil {
			return db.User{}, apperr.Internal("INTERNAL", "replace user")
		}
	}

	// 4. Create fresh account.
	role := "user"
	if h.d.Cfg.AdminBootstrapEmail != "" &&
		strings.ToLower(ident.Email) == strings.ToLower(h.d.Cfg.AdminBootstrapEmail) {
		if has, herr := h.d.Q.HasAdmin(ctx); herr == nil && !has {
			role = "admin"
		}
	}
	created, cerr := h.d.Q.CreateUser(ctx, db.CreateUserParams{
		Email:         strings.ToLower(ident.Email),
		EmailVerified: true,
		PasswordHash:  nil,
		GoogleSub:     nil,
		DiscordID:     ptr(ident.ID),
		DisplayName:   ptr(ident.Username),
		PhotoUrl:      ptr(ident.AvatarURL()),
		Role:          role,
	})
	if cerr != nil {
		return db.User{}, apperr.Internal("INTERNAL", "create user")
	}
	return created, nil
}

func hasRole(roles []string, roleID string) bool {
	for _, r := range roles {
		if r == roleID {
			return true
		}
	}
	return false
}
