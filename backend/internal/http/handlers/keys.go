package handlers

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/store/db"
	"github.com/ado/ado/backend/internal/validate"
)

type KeysDeps struct {
	Q       *db.Queries
	Keys    *keys.Service
	Limiter *mw.Limiter
	RpmCfg  *proxy.RpmConfig
}

type Keys struct{ d KeysDeps }

func NewKeys(d KeysDeps) *Keys { return &Keys{d: d} }

// Current returns the active key metadata. Raw key is never returned here.
func (k *Keys) Current(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	row, err := k.d.Q.GetActiveKeyWithQuotaByUser(r.Context(), sess.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.NotFound("NOT_FOUND", "no active key"))
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load key"))
		return
	}
	used := int32(0)
	if u, uerr := k.d.Q.GetUsageForToday(r.Context(), row.ID); uerr == nil {
		used = u
	}

	now := time.Now().UTC()
	resetsAt := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)

	rpmLimit := 20
	if k.d.RpmCfg != nil {
		rpmLimit = k.d.RpmCfg.Get()
	}
	rpmUsed := int64(0)
	if k.d.Limiter != nil {
		rpmUsed = k.d.Limiter.RPMUsed(r.Context(), row.ID.String())
	}

	out := map[string]any{
		"keyPrefix":     row.KeyPrefix,
		"dailyLimit":    row.DailyLimit,
		"used":          used,
		"resetsAt":      resetsAt.Format(time.RFC3339),
		"createdAt":     row.CreatedAt.Time.Format(time.RFC3339),
		"rpmLimit":      rpmLimit,
		"rpmUsed":       rpmUsed,
		"reasoningMode": row.ReasoningMode,
	}
	if row.LastUsedAt.Valid {
		out["lastUsedAt"] = row.LastUsedAt.Time.Format(time.RFC3339)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (k *Keys) Rotate(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	issued, err := k.d.Keys.Rotate(r.Context(), sess.UserID)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "rotate"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"key":        issued.Raw,
		"keyPrefix":  issued.Prefix,
		"dailyLimit": issued.DailyLimit,
	})
}

// SetReasoning toggles step-by-step reasoning injection on the user's active key.
func (k *Keys) SetReasoning(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := validate.Bind(r, &req); err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID", err.Error()))
		return
	}
	if err := k.d.Q.SetActiveKeyReasoningMode(r.Context(), db.SetActiveKeyReasoningModeParams{
		UserID:        sess.UserID,
		ReasoningMode: req.Enabled,
	}); err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "set reasoning mode"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"reasoningMode": req.Enabled})
}

func (k *Keys) Usage(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	key, err := k.d.Q.GetActiveKeyByUser(r.Context(), sess.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]any{})
		return
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load key"))
		return
	}
	rows, err := k.d.Q.GetKeyUsageHistory(r.Context(), key.ID)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "load usage"))
		return
	}
	type dayUsage struct {
		Day  string `json:"day"`
		Used int32  `json:"used"`
	}
	out := make([]dayUsage, len(rows))
	for i, row := range rows {
		out[i] = dayUsage{
			Day:  row.Day.Time.Format("2006-01-02"),
			Used: row.Used,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (k *Keys) Flash(w http.ResponseWriter, r *http.Request) {
	sess, ok := mw.SessionFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "not signed in"))
		return
	}
	hexID := hex.EncodeToString(sess.ID)
	issued, err := k.d.Keys.PopFlash(r.Context(), hexID)
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "flash"))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if issued.Raw == "" {
		_ = json.NewEncoder(w).Encode(map[string]any{"key": nil})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"key":        issued.Raw,
		"keyPrefix":  issued.Prefix,
		"dailyLimit": issued.DailyLimit,
	})
}
