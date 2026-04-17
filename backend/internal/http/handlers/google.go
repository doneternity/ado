package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/auth"
	"github.com/ado/ado/backend/internal/auth/oauth"
	"github.com/ado/ado/backend/internal/config"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/store/db"
)

type GoogleDeps struct {
	Cfg      *config.Config
	Q        *db.Queries
	Sessions *auth.Sessions
	Google   *oauth.Google
}

type Google struct{ d GoogleDeps }

func NewGoogle(d GoogleDeps) *Google { return &Google{d: d} }

func (g *Google) Start(w http.ResponseWriter, r *http.Request) {
	url, err := g.d.Google.AuthURL(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "auth url"))
		return
	}
	http.Redirect(w, r, url, http.StatusFound)
}

func (g *Google) Callback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "missing code/state"))
		return
	}

	ident, err := g.d.Google.Exchange(r.Context(), code, state)
	if errors.Is(err, oauth.ErrInvalidState) {
		apperr.Write(w, apperr.BadRequest("INVALID_STATE", "invalid or expired state"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", err.Error()))
		return
	}

	// Account resolution per spec §7.8.
	user, err := g.d.Q.GetUserByGoogleSub(r.Context(), ptr(ident.Sub))
	switch {
	case err == nil:
		// already linked — fall through to session creation
	case errors.Is(err, pgx.ErrNoRows):
		existing, eerr := g.d.Q.GetUserByEmail(r.Context(), strings.ToLower(ident.Email))
		if eerr != nil && !errors.Is(eerr, pgx.ErrNoRows) {
			apperr.Write(w, apperr.Internal("INTERNAL", "lookup"))
			return
		}
		switch {
		case eerr == nil && existing.EmailVerified:
			// silently link google sub to the verified account
			if err := g.d.Q.LinkGoogleSub(r.Context(), db.LinkGoogleSubParams{
				ID:          existing.ID,
				GoogleSub:   ptr(ident.Sub),
				PhotoUrl:    ident.Picture,
				DisplayName: ident.Name,
			}); err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", "link"))
				return
			}
			user = existing
			user.GoogleSub = ptr(ident.Sub)
		case eerr == nil && !existing.EmailVerified:
			// delete unverified account then create a fresh one
			if err := g.d.Q.DeleteUser(r.Context(), existing.ID); err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", "replace"))
				return
			}
			fallthrough
		default:
			created, cerr := g.d.Q.CreateUser(r.Context(), db.CreateUserParams{
				Email:         strings.ToLower(ident.Email),
				EmailVerified: true,
				PasswordHash:  nil,
				GoogleSub:     ptr(ident.Sub),
				DisplayName:   ptr(ident.Name),
				PhotoUrl:      ptr(ident.Picture),
				Role:          "user",
			})
			if cerr != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", "create"))
				return
			}
			user = created
		}
	default:
		apperr.Write(w, apperr.Internal("INTERNAL", "lookup"))
		return
	}

	if user.Banned {
		apperr.Write(w, apperr.Forbidden("BANNED", "account suspended"))
		return
	}

	sess, cookie, err := g.d.Sessions.Create(r.Context(), user.ID, r.UserAgent(), mw.ClientIP(r))
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "session"))
		return
	}
	g.d.Sessions.SetCookie(w, cookie)
	_ = sess // sess.CSRFToken used by /me on next call

	http.Redirect(w, r, g.d.Cfg.AppBaseURL+"/dashboard", http.StatusFound)
}
