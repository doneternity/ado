package proxy

import (
	"bytes"
	"encoding/json"
)

// Usage is the token count a provider reported for a request, when it did.
type Usage struct {
	PromptTokens     *int32
	CompletionTokens *int32
}

// tailBuffer keeps roughly the last max bytes written to it, so the usage
// block at the end of a response can be read without holding the whole body.
type tailBuffer struct {
	buf []byte
	max int
}

func newTailBuffer(max int) *tailBuffer { return &tailBuffer{max: max} }

func (t *tailBuffer) Write(p []byte) {
	t.buf = append(t.buf, p...)
	// Trim only once it's twice the size, so writes stay cheap.
	if len(t.buf) > 2*t.max {
		t.buf = append(t.buf[:0], t.buf[len(t.buf)-t.max:]...)
	}
}

func (t *tailBuffer) Bytes() []byte {
	if len(t.buf) > t.max {
		return t.buf[len(t.buf)-t.max:]
	}
	return t.buf
}

var usageKey = []byte(`"usage"`)

// parseUsage finds the last non-null "usage" object in a response tail. It
// covers plain JSON replies and SSE streams (where the final chunk carries
// usage), in OpenAI (prompt/completion_tokens) and Anthropic
// (input/output_tokens) shapes.
func parseUsage(tail []byte) Usage {
	for end := len(tail); ; {
		i := bytes.LastIndex(tail[:end], usageKey)
		if i < 0 {
			return Usage{}
		}
		end = i
		rest := bytes.TrimLeft(tail[i+len(usageKey):], " \t\r\n")
		if len(rest) == 0 || rest[0] != ':' {
			continue
		}
		var u struct {
			PromptTokens     *int32 `json:"prompt_tokens"`
			CompletionTokens *int32 `json:"completion_tokens"`
			InputTokens      *int32 `json:"input_tokens"`
			OutputTokens     *int32 `json:"output_tokens"`
		}
		if json.NewDecoder(bytes.NewReader(rest[1:])).Decode(&u) != nil {
			continue
		}
		out := Usage{PromptTokens: u.PromptTokens, CompletionTokens: u.CompletionTokens}
		if out.PromptTokens == nil {
			out.PromptTokens = u.InputTokens
		}
		if out.CompletionTokens == nil {
			out.CompletionTokens = u.OutputTokens
		}
		if out.PromptTokens != nil || out.CompletionTokens != nil {
			return out
		}
	}
}

// usageChunkFilter drops the usage-only event that stream_options.include_usage
// adds at the end of a stream ("choices": [] plus "usage"), for clients that
// didn't ask for it: ADO turns it on to count tokens, and some clients read
// choices[0] from every chunk and would break on the extra one. It works line
// by line, carrying an unfinished line over to the next chunk.
type usageChunkFilter struct {
	partial   []byte
	skipBlank bool // the dropped event's blank separator line comes next
}

func (f *usageChunkFilter) push(p []byte) []byte {
	data := append(f.partial, p...)
	var out []byte
	for {
		i := bytes.IndexByte(data, '\n')
		if i < 0 {
			break
		}
		line := data[:i+1]
		data = data[i+1:]
		trimmed := bytes.TrimRight(line, "\r\n")
		if f.skipBlank && len(trimmed) == 0 {
			f.skipBlank = false
			continue
		}
		f.skipBlank = false
		if isUsageOnlyEvent(trimmed) {
			f.skipBlank = true
			continue
		}
		out = append(out, line...)
	}
	f.partial = append([]byte(nil), data...)
	return out
}

// flush returns an unfinished last line, unless it's the usage-only event.
func (f *usageChunkFilter) flush() []byte {
	p := f.partial
	f.partial = nil
	if isUsageOnlyEvent(bytes.TrimRight(p, "\r\n")) {
		return nil
	}
	return p
}

func isUsageOnlyEvent(line []byte) bool {
	if !bytes.HasPrefix(line, []byte("data:")) {
		return false
	}
	payload := bytes.TrimSpace(line[len("data:"):])
	if len(payload) == 0 || payload[0] != '{' || !bytes.Contains(payload, usageKey) {
		return false
	}
	var ev struct {
		Choices []json.RawMessage `json:"choices"`
		Usage   json.RawMessage   `json:"usage"`
	}
	if json.Unmarshal(payload, &ev) != nil {
		return false
	}
	return len(ev.Choices) == 0 && len(ev.Usage) > 0 && string(ev.Usage) != "null"
}
