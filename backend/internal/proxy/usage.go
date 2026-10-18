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
