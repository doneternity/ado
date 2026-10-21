package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
	"github.com/ado/ado/backend/internal/store/db"
)

// maxPassthroughBody caps passthrough request bodies. Larger than chat to allow
// image/audio uploads, but bounded to protect the server.
const maxPassthroughBody = 25 << 20 // 25 MB

// maxChatBody caps chat requests. Images sent inline (base64 data URLs) make
// these large: one phone photo is several MB, so 512 KB turned them away.
const maxChatBody = 16 << 20 // 16 MB

// maxModelName bounds the model field, which is stored with every request.
const maxModelName = 200

// statusClientClosed is logged when the client went away before any provider
// answered (nginx's 499). It's a 4xx, so it isn't counted as a server error,
// a failed request in the status history, or a sign the model is down.
const statusClientClosed = 499

// clientGone reports whether a forward ended because the client disconnected.
func clientGone(r *http.Request, err error) bool {
	return r.Context().Err() != nil || errors.Is(err, context.Canceled)
}

// checkModel answers for the model field before anything is charged: a missing
// model gets a clear 400, and one no provider lists gets ADO's own 404 (rather
// than a provider's "unknown model" error naming the provider). required is
// false for endpoints where the model is optional or the body isn't JSON.
func (p *Proxy) checkModel(w http.ResponseWriter, r *http.Request, model string, required bool) bool {
	if len(model) > maxModelName {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "model name too long"))
		return false
	}
	if strings.TrimSpace(model) == "" {
		if required {
			apperr.Write(w, apperr.BadRequest("MODEL_REQUIRED", "the model field is required; see https://adoai.space/models for the models you can use"))
			return false
		}
		return true
	}
	if !p.d.Registry.Serves(r.Context(), model) {
		apperr.Write(w, apperr.NotFound("MODEL_NOT_FOUND", fmt.Sprintf("the model %q isn't available; see https://adoai.space/models for the models you can use", model)))
		return false
	}
	return true
}

// nextQuotaReset is when today's quota resets: the next midnight UTC, the
// same day boundary daily_usage uses.
func nextQuotaReset(now time.Time) time.Time {
	y, m, d := now.UTC().Date()
	return time.Date(y, m, d+1, 0, 0, 0, 0, time.UTC)
}

// charge takes one request from the key's daily quota. On success it sets the
// X-Ado-Quota-* headers so clients can see what's left; when the quota is
// used up it answers 429 with the reset time and a Retry-After, since API
// users never see the dashboard. false means the response has been written.
func (p *Proxy) charge(w http.ResponseWriter, r *http.Request, bk mw.BearerKeyContext) bool {
	reset := nextQuotaReset(time.Now())
	used, err := p.d.Quota.Charge(r.Context(), bk.KeyID, bk.DailyLimit)
	if errors.Is(err, quota.ErrExceeded) {
		wait := time.Until(reset)
		w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		setQuotaHeaders(w, bk.DailyLimit, bk.DailyLimit, reset)
		apperr.Write(w, apperr.TooMany("QUOTA_EXCEEDED", fmt.Sprintf(
			"you've used all %d requests for today; the quota resets at 00:00 UTC, in %s",
			bk.DailyLimit, roughDuration(wait))).
			WithExtra("limit", bk.DailyLimit).
			WithExtra("resets_at", reset.Format(time.RFC3339)))
		return false
	}
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "quota"))
		return false
	}
	setQuotaHeaders(w, bk.DailyLimit, used, reset)
	return true
}

func setQuotaHeaders(w http.ResponseWriter, limit, used int32, reset time.Time) {
	h := w.Header()
	h.Set("X-Ado-Quota-Limit", strconv.Itoa(int(limit)))
	h.Set("X-Ado-Quota-Remaining", strconv.Itoa(int(max(0, limit-used))))
	h.Set("X-Ado-Quota-Reset", reset.Format(time.RFC3339))
}

// roughDuration: "6h 12m", "41m", "under a minute".
func roughDuration(d time.Duration) string {
	mins := int(d.Minutes())
	switch {
	case mins < 1:
		return "under a minute"
	case mins < 60:
		return fmt.Sprintf("%dm", mins)
	default:
		return fmt.Sprintf("%dh %dm", mins/60, mins%60)
	}
}

// refund returns the quota unit charged for this request. It runs detached
// from the request, which may already be cancelled (that's often why we're
// refunding), so the refund still happens.
func (p *Proxy) refund(r *http.Request, keyID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 5*time.Second)
	defer cancel()
	if err := p.d.Quota.Refund(ctx, keyID); err != nil {
		slog.Warn("quota refund failed", "err", err)
	}
}

type ProxyDeps struct {
	Registry    *proxy.Registry
	Maintenance *proxy.MaintenanceFlag
	Quota       *quota.Service
	// Queries lets admins through maintenance mode; nil blocks everyone.
	Queries *db.Queries
}

type Proxy struct{ d ProxyDeps }

func NewProxy(d ProxyDeps) *Proxy { return &Proxy{d: d} }

// blocked reports whether maintenance mode refuses this request. Admins, found
// by bearer key or session, are let through so they can test while working.
func (p *Proxy) blocked(r *http.Request) bool {
	if !p.d.Maintenance.Enabled() {
		return false
	}
	if p.d.Queries == nil {
		return true
	}
	var uid uuid.UUID
	if bk, ok := mw.BearerFromContext(r.Context()); ok {
		uid = bk.UserID
	} else if s, ok := mw.SessionFromContext(r.Context()); ok {
		uid = s.UserID
	} else {
		return true
	}
	u, err := p.d.Queries.GetUserByID(r.Context(), uid)
	return err != nil || u.Role != "admin"
}

func (p *Proxy) ChatCompletions(w http.ResponseWriter, r *http.Request) {
	if p.blocked(r) {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	bk, ok := mw.BearerFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}

	data, err := io.ReadAll(io.LimitReader(r.Body, maxChatBody+1))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "could not read request body"))
		return
	}
	if int64(len(data)) > maxChatBody {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "request body too large (16 MB at most)"))
		return
	}
	if !json.Valid(data) {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "invalid JSON"))
		return
	}

	var meta struct {
		Model  string `json:"model"`
		Stream bool   `json:"stream"`
	}
	_ = json.Unmarshal(data, &meta)
	note := mw.RequestNoteFrom(r.Context())
	if note != nil {
		note.Model, note.Stream = meta.Model, meta.Stream
	}
	if !p.checkModel(w, r, meta.Model, true) {
		return
	}

	// When the key has reasoning mode on, ask the model to show its step-by-step
	// thinking. Injection failures fall back to the original body.
	if bk.ReasoningMode {
		data = injectReasoning(data)
	}

	// Streams only report token usage when asked to; ask, so usage is logged
	// (and counted once plans go by tokens), and hide the extra chunk from a
	// client that didn't ask for it.
	var opts proxy.ForwardOptions
	if meta.Stream {
		data, opts.HideUsageChunk = withStreamUsage(data)
	}

	if !p.charge(w, r, bk) {
		return
	}
	start := time.Now()
	res, ferr := p.d.Registry.ForwardWith(w, r, "/chat/completions", data, opts)
	noteResult(note, res)
	if !res.Started {
		// Nothing reached the client, so nothing was used: refund.
		p.refund(r, bk.KeyID)
		if clientGone(r, ferr) {
			// The client left before any provider answered (Stop, a closed tab,
			// a tool's timeout). Not the model's fault and not a server error.
			apperr.Write(w, apperr.New(statusClientClosed, "CLIENT_CLOSED", "client closed the request"))
			return
		}
		// No provider could serve it: the model looks unhealthy.
		p.d.Registry.Health().Record(meta.Model, false)
		slog.Warn("proxy no provider", "path", "/chat/completions", "model", meta.Model, "attempts", res.Attempts, "err", ferr)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	// 2xx with no stream error means the model is healthy. refund client
	// errors (4xx): they never used model capacity. 5xx/429 fail over earlier.
	if res.Status >= 200 && res.Status < 300 && ferr == nil {
		p.d.Registry.Health().Record(meta.Model, true)
	}
	if res.Status >= 400 && res.Status < 500 {
		p.refund(r, bk.KeyID)
	}
	slog.Info("proxy request", "path", "/chat/completions", "model", meta.Model,
		"provider", res.Provider, "attempts", res.Attempts, "status", res.Status,
		"ms", time.Since(start).Milliseconds(), "stream_err", ferr != nil)
}

func (p *Proxy) Models(w http.ResponseWriter, r *http.Request) {
	if p.blocked(r) {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	if _, ok := mw.BearerFromContext(r.Context()); !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}
	if err := p.d.Registry.AggregateModels(w, r); err != nil {
		slog.Warn("aggregate models failed", "err", err)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
	}
}

const reasoningInstruction = "Before giving your final answer, reason through the problem step by step and show that reasoning in your reply. Lay out your thinking first, then clearly present your final answer."

// withStreamUsage turns on stream_options.include_usage for a streaming chat
// request whose client didn't set it, keeping every other field as sent.
// added reports whether it did; a client's own choice (true or false) stands.
func withStreamUsage(body []byte) (out []byte, added bool) {
	var payload map[string]json.RawMessage
	if json.Unmarshal(body, &payload) != nil {
		return body, false
	}
	opts := map[string]json.RawMessage{}
	if raw, ok := payload["stream_options"]; ok && string(raw) != "null" {
		if json.Unmarshal(raw, &opts) != nil {
			return body, false
		}
		if _, set := opts["include_usage"]; set {
			return body, false
		}
	}
	opts["include_usage"] = json.RawMessage("true")
	raw, err := json.Marshal(opts)
	if err != nil {
		return body, false
	}
	payload["stream_options"] = raw
	out, err = json.Marshal(payload)
	if err != nil {
		return body, false
	}
	return out, true
}

// injectReasoning adds a step-by-step reasoning instruction to a chat-completions
// body. It appends to an existing leading system message, or prepends a new one.
// Only the messages are touched: every other field keeps its exact JSON, so
// large numbers (a seed, say) don't lose precision on the way through. Any
// parse failure returns the body unchanged so a malformed payload still reaches
// the upstream (which will report the real error).
func injectReasoning(body []byte) []byte {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return body
	}
	var msgs []map[string]json.RawMessage
	if raw, ok := payload["messages"]; !ok || json.Unmarshal(raw, &msgs) != nil {
		return body
	}

	if len(msgs) > 0 {
		var role, content string
		if json.Unmarshal(msgs[0]["role"], &role) == nil && role == "system" &&
			json.Unmarshal(msgs[0]["content"], &content) == nil {
			c, err := json.Marshal(content + "\n\n" + reasoningInstruction)
			if err != nil {
				return body
			}
			msgs[0]["content"] = c
			return withMessages(body, payload, msgs)
		}
	}
	sys := map[string]json.RawMessage{
		"role":    json.RawMessage(`"system"`),
		"content": mustJSON(reasoningInstruction),
	}
	return withMessages(body, payload, append([]map[string]json.RawMessage{sys}, msgs...))
}

func withMessages(body []byte, payload map[string]json.RawMessage, msgs []map[string]json.RawMessage) []byte {
	raw, err := json.Marshal(msgs)
	if err != nil {
		return body
	}
	payload["messages"] = raw
	out, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return out
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func (p *Proxy) PublicModels(w http.ResponseWriter, r *http.Request) {
	if p.blocked(r) {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	if err := p.d.Registry.AggregateModels(w, r); err != nil {
		slog.Warn("aggregate models failed", "err", err)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
	}
}

// Passthrough forwards a request to the given upstream path with the same
// failover/streaming behaviour as chat completions. It charges one quota unit
// and refunds it if no provider serves the request or it's rejected with a 4xx.
// Works for JSON, multipart (image/audio uploads), and binary responses.
func (p *Proxy) Passthrough(upstreamPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if p.blocked(r) {
			apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
			return
		}
		bk, ok := mw.BearerFromContext(r.Context())
		if !ok {
			apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
			return
		}

		data, err := io.ReadAll(io.LimitReader(r.Body, maxPassthroughBody+1))
		if err != nil {
			apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "could not read request body"))
			return
		}
		if int64(len(data)) > maxPassthroughBody {
			apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "request body too large"))
			return
		}

		// JSON bodies (embeddings, images, responses...) usually name the model;
		// multipart uploads (audio) are left unparsed.
		note := mw.RequestNoteFrom(r.Context())
		if json.Valid(data) {
			var meta struct {
				Model  string `json:"model"`
				Stream bool   `json:"stream"`
			}
			_ = json.Unmarshal(data, &meta)
			if note != nil {
				note.Model, note.Stream = meta.Model, meta.Stream
			}
			if !p.checkModel(w, r, meta.Model, false) {
				return
			}
		}

		if !p.charge(w, r, bk) {
			return
		}

		start := time.Now()
		res, ferr := p.d.Registry.Forward(w, r, upstreamPath, data)
		noteResult(note, res)
		if !res.Started {
			p.refund(r, bk.KeyID)
			if clientGone(r, ferr) {
				apperr.Write(w, apperr.New(statusClientClosed, "CLIENT_CLOSED", "client closed the request"))
				return
			}
			slog.Warn("passthrough no provider", "path", upstreamPath, "attempts", res.Attempts, "err", ferr)
			apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
			return
		}
		if res.Status >= 400 && res.Status < 500 {
			p.refund(r, bk.KeyID)
		}
		slog.Info("proxy request", "path", upstreamPath, "provider", res.Provider,
			"attempts", res.Attempts, "status", res.Status,
			"ms", time.Since(start).Milliseconds(), "stream_err", ferr != nil)
	}
}

// realtimeHeaders are the only client headers passed on to the provider for
// a realtime connection: what a WebSocket upgrade needs, plus the API's own.
// Like the other endpoints, the visitor's IP and location never go along.
var realtimeHeaders = []string{
	"Connection", "Upgrade", "Sec-Websocket-Key", "Sec-Websocket-Version",
	"Sec-Websocket-Extensions", "Sec-Websocket-Protocol",
	"Openai-Beta", "Content-Type", "Accept",
}

// Realtime reverse-proxies the WebSocket realtime endpoint to a provider that
// serves the requested model (?model=). It cannot fail over mid-connection, so
// it uses one provider key, picked the way Forward would pick it, and rewrites
// auth to that key. Each connection counts as one request against the daily
// quota (refunded if the provider can't be reached) and the per-minute limit
// (in the router). Browser clients can't set the Authorization header on a
// WebSocket, so this serves server-side clients (Bearer required).
func (p *Proxy) Realtime(w http.ResponseWriter, r *http.Request) {
	if p.blocked(r) {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	bk, ok := mw.BearerFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}
	model := r.URL.Query().Get("model")
	if note := mw.RequestNoteFrom(r.Context()); note != nil {
		note.Model, note.Stream = model, true
	}
	if !p.checkModel(w, r, model, false) {
		return
	}
	fwd := p.d.Registry.Pick(r.Context(), model)
	if fwd == nil {
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	target, err := url.Parse(fwd.BaseURL)
	if err != nil {
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	if !p.charge(w, r, bk) {
		return
	}
	rp := &httputil.ReverseProxy{
		// Rewrite (unlike the old Director) starts from a copy with the inbound
		// X-Forwarded-* headers removed and doesn't add the visitor's IP. The
		// rest of the headers are cut down to realtimeHeaders.
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = target.Scheme
			pr.Out.URL.Host = target.Host
			pr.Out.URL.Path = strings.TrimRight(target.Path, "/") + "/realtime"
			pr.Out.URL.RawPath = ""
			if model != "" {
				q := pr.Out.URL.Query()
				q.Set("model", fwd.UpstreamID(model))
				pr.Out.URL.RawQuery = q.Encode()
			}
			pr.Out.Host = target.Host
			kept := http.Header{}
			for _, k := range realtimeHeaders {
				for _, v := range pr.Out.Header.Values(k) {
					kept.Add(k, v)
				}
			}
			pr.Out.Header = kept
			pr.Out.Header.Set("Authorization", "Bearer "+fwd.APIKey)
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, e error) {
			p.refund(r, bk.KeyID) // never connected, so nothing was used
			if clientGone(r, e) {
				apperr.Write(w, apperr.New(statusClientClosed, "CLIENT_CLOSED", "client closed the request"))
				return
			}
			slog.Warn("realtime proxy failed", "provider", fwd.Name(), "err", e)
			apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		},
	}
	rp.ServeHTTP(w, r)
}

// noteResult copies what Forward learned (serving provider, token counts) into
// the request log note.
func noteResult(note *mw.RequestNote, res proxy.ForwardResult) {
	if note == nil {
		return
	}
	if u, err := url.Parse(res.Provider); err == nil {
		note.Provider = u.Host
	}
	note.PromptTokens, note.CompletionTokens = res.Usage.PromptTokens, res.Usage.CompletionTokens
}
