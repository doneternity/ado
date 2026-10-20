package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

// settingAnnouncement holds the site-wide notice as JSON (see announcement).
const settingAnnouncement = "announcement"

// How long the public endpoint serves the cached notice before reading the
// database again. Every page view asks for it, so it mustn't cost a query each.
const announcementCacheTTL = 30 * time.Second

// announcement is the site-wide notice admins set in Admin > Maintenance. ID
// changes on every save, so a new message reappears for visitors who
// dismissed the previous one.
type announcement struct {
	ID        string `json:"id,omitempty"`
	Message   string `json:"message,omitempty"`
	LinkURL   string `json:"linkUrl,omitempty"`
	LinkLabel string `json:"linkLabel,omitempty"`
}

type Announcement struct {
	q *db.Queries

	mu        sync.Mutex
	cached    announcement
	fetchedAt time.Time
}

func NewAnnouncement(q *db.Queries) *Announcement { return &Announcement{q: q} }

func (h *Announcement) load(ctx context.Context) (announcement, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.fetchedAt.IsZero() && time.Since(h.fetchedAt) < announcementCacheTTL {
		return h.cached, nil
	}
	var a announcement
	v, err := h.q.GetSetting(ctx, settingAnnouncement)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return announcement{}, err
	default:
		if jerr := json.Unmarshal([]byte(v), &a); jerr != nil {
			slog.Warn("announcement setting is not valid JSON", "err", jerr)
			a = announcement{}
		}
	}
	h.cached, h.fetchedAt = a, time.Now()
	return a, nil
}

func writeAnnouncement(w http.ResponseWriter, a announcement) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(a)
}

// Public returns the current notice, or {} when there is none.
func (h *Announcement) Public(w http.ResponseWriter, r *http.Request) {
	a, err := h.load(r.Context())
	if err != nil {
		// A notice is never worth an error page; show nothing instead.
		slog.Warn("load announcement", "err", err)
		a = announcement{}
	}
	writeAnnouncement(w, a)
}

// Get is the admin read, always fresh from the database.
func (h *Announcement) Get(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	h.fetchedAt = time.Time{}
	h.mu.Unlock()
	a, err := h.load(r.Context())
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load announcement"))
		return
	}
	writeAnnouncement(w, a)
}

// Set saves a new notice; an empty message clears it.
func (h *Announcement) Set(w http.ResponseWriter, r *http.Request) {
	var req announcement
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	req.LinkURL = strings.TrimSpace(req.LinkURL)
	req.LinkLabel = strings.TrimSpace(req.LinkLabel)
	if len([]rune(req.Message)) > 280 {
		apperr.Write(w, apperr.BadRequest("INVALID", "message must be at most 280 characters"))
		return
	}
	if req.LinkURL != "" {
		u, err := url.Parse(req.LinkURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || len(req.LinkURL) > 500 {
			apperr.Write(w, apperr.BadRequest("INVALID", "link must be an https:// address"))
			return
		}
		if req.LinkLabel == "" {
			req.LinkLabel = "Learn more"
		}
		if len([]rune(req.LinkLabel)) > 40 {
			apperr.Write(w, apperr.BadRequest("INVALID", "link label must be at most 40 characters"))
			return
		}
	} else {
		req.LinkLabel = ""
	}

	var a announcement
	if req.Message != "" {
		a = announcement{
			ID:        strconv.FormatInt(time.Now().UnixMilli(), 36),
			Message:   req.Message,
			LinkURL:   req.LinkURL,
			LinkLabel: req.LinkLabel,
		}
	}
	raw, _ := json.Marshal(a)
	if err := h.q.SetSetting(r.Context(), db.SetSettingParams{Key: settingAnnouncement, Value: string(raw)}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "save announcement"))
		return
	}
	h.mu.Lock()
	h.cached, h.fetchedAt = a, time.Now()
	h.mu.Unlock()
	writeAnnouncement(w, a)
}
