package proxy

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
)

// Model aliases: a provider can tag its model IDs with a suffix (a reseller's
// "gpt-6-sol-thanks-somewhere"). With Forwarder.ModelSuffix set, ADO lists and
// accepts the plain ID ("gpt-6-sol"), puts the provider's real ID in the
// request it forwards, and swaps it back out of the response. The full ID is
// still accepted.

// publicID is the ID ADO shows for one of this provider's model IDs.
func (f *Forwarder) publicID(upstream string) string {
	if f.ModelSuffix == "" || !strings.HasSuffix(upstream, f.ModelSuffix) || len(upstream) == len(f.ModelSuffix) {
		return upstream
	}
	return strings.TrimSuffix(upstream, f.ModelSuffix)
}

// upstreamID is the provider's own ID for a model asked for by its plain ID.
func (f *Forwarder) upstreamID(model string) string {
	if a := f.aliases.Load(); a != nil {
		if up, ok := (*a)[model]; ok {
			return up
		}
	}
	return model
}

// suffixNamePattern matches the suffix's words at the end of a display name,
// with or without brackets: "-thanks-somewhere" matches "(Thanks Somewhere)".
func suffixNamePattern(suffix string) *regexp.Regexp {
	words := strings.FieldsFunc(suffix, func(r rune) bool { return r == '-' || r == '_' || r == ' ' || r == '.' })
	if len(words) == 0 {
		return nil
	}
	for i, w := range words {
		words[i] = regexp.QuoteMeta(w)
	}
	return regexp.MustCompile(`(?i)[\s\-_]*[(\[]?\s*` + strings.Join(words, `[\s\-_.]+`) + `\s*[)\]]?\s*$`)
}

// publicEntry rewrites one /models entry to its plain ID, dropping the
// suffix from its display name too. Entries without the suffix are returned
// as they are; the original map is never changed.
func (f *Forwarder) publicEntry(m map[string]any, nameRe *regexp.Regexp) map[string]any {
	id, _ := m["id"].(string)
	pub := f.publicID(id)
	if pub == id {
		return m
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	out["id"] = pub
	for _, k := range []string{"display_name", "name"} {
		if s, ok := out[k].(string); ok && nameRe != nil {
			if cleaned := strings.TrimSpace(nameRe.ReplaceAllString(s, "")); cleaned != "" {
				out[k] = cleaned
			}
		}
	}
	return out
}

// withModel returns body with its "model" field set to model, or body
// unchanged when it isn't a JSON object or nothing needs changing.
func withModel(body []byte, model string) []byte {
	var obj map[string]json.RawMessage
	if json.Unmarshal(body, &obj) != nil {
		return body
	}
	raw, err := json.Marshal(model)
	if err != nil {
		return body
	}
	obj["model"] = raw
	out, err := json.Marshal(obj)
	if err != nil {
		return body
	}
	return out
}

// quotedSwap replaces one quoted string ("old") with another ("new") in a
// response as it streams, so the provider's tagged ID doesn't reach the
// client. It holds back just enough at the end of each chunk to catch a
// match split across two chunks.
type quotedSwap struct {
	old, new []byte
	pending  []byte
}

func newQuotedSwap(old, new string) *quotedSwap {
	o, _ := json.Marshal(old)
	n, _ := json.Marshal(new)
	return &quotedSwap{old: o, new: n}
}

// push takes the next chunk and returns what can be sent now.
func (q *quotedSwap) push(p []byte) []byte {
	data := bytes.ReplaceAll(append(q.pending, p...), q.old, q.new)
	k := min(len(q.old)-1, len(data))
	for ; k > 0; k-- {
		if bytes.HasSuffix(data, q.old[:k]) {
			break
		}
	}
	q.pending = append([]byte(nil), data[len(data)-k:]...)
	return data[:len(data)-k]
}

// flush returns whatever was held back, at the end of the response.
func (q *quotedSwap) flush() []byte {
	p := q.pending
	q.pending = nil
	return p
}
