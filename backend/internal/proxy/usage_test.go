package proxy

import (
	"strings"
	"testing"
)

func i32v(p *int32) int32 {
	if p == nil {
		return -1
	}
	return *p
}

func TestParseUsage(t *testing.T) {
	cases := []struct {
		name             string
		body             string
		prompt, complete int32 // -1 = not reported
	}{
		{"plain JSON reply",
			`{"id":"x","choices":[{"message":{"content":"hi"}}],"usage":{"prompt_tokens":12,"completion_tokens":34,"total_tokens":46}}`, 12, 34},
		{"SSE stream with final usage chunk",
			"data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}],\"usage\":null}\n\n" +
				"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":7}}\n\ndata: [DONE]\n\n", 5, 7},
		{"Anthropic shape",
			`{"type":"message","usage":{"input_tokens":9,"output_tokens":3}}`, 9, 3},
		{"no usage at all", `{"choices":[]}`, -1, -1},
		{"only null usage", "data: {\"usage\":null}\n\ndata: [DONE]\n\n", -1, -1},
		{"the word usage in content is ignored", `{"choices":[{"message":{"content":"\"usage\" is a word"}}]}`, -1, -1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			u := parseUsage([]byte(tc.body))
			if i32v(u.PromptTokens) != tc.prompt || i32v(u.CompletionTokens) != tc.complete {
				t.Fatalf("got prompt=%d completion=%d, want %d/%d", i32v(u.PromptTokens), i32v(u.CompletionTokens), tc.prompt, tc.complete)
			}
		})
	}
}

func TestTailBuffer_KeepsEnd(t *testing.T) {
	tb := newTailBuffer(32)
	for i := 0; i < 100; i++ {
		tb.Write([]byte(strings.Repeat("x", 7)))
	}
	tb.Write([]byte(`"usage":{"prompt_tokens":1}`))
	got := string(tb.Bytes())
	if len(got) > 32 || !strings.HasSuffix(got, `{"prompt_tokens":1}`) {
		t.Fatalf("tail = %q (len %d)", got, len(got))
	}
}
