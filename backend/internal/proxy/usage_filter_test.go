package proxy

import (
	"strings"
	"testing"
)

const streamWithUsage = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n" +
	"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":1}}\n\n" +
	"data: [DONE]\n\n"

const streamWithoutUsage = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n" +
	"data: [DONE]\n\n"

// The usage-only event goes, wherever the chunks split; everything else is
// passed through untouched.
func TestUsageChunkFilter_DropsOnlyTheUsageEvent(t *testing.T) {
	for cut := 0; cut <= len(streamWithUsage); cut++ {
		f := &usageChunkFilter{}
		out := string(f.push([]byte(streamWithUsage[:cut]))) + string(f.push([]byte(streamWithUsage[cut:]))) + string(f.flush())
		if out != streamWithoutUsage {
			t.Fatalf("cut %d: got %q", cut, out)
		}
	}
	// A normal chunk that happens to carry usage alongside choices stays.
	keep := "data: {\"choices\":[{\"delta\":{}}],\"usage\":{\"prompt_tokens\":1}}\n\n"
	f := &usageChunkFilter{}
	if out := string(f.push([]byte(keep))) + string(f.flush()); out != keep {
		t.Fatalf("kept event changed: %q", out)
	}
}

// Usage is still read from the full stream (the tail sees it before the filter).
func TestParseUsage_FromHiddenEvent(t *testing.T) {
	u := parseUsage([]byte(streamWithUsage))
	if u.PromptTokens == nil || *u.PromptTokens != 5 || u.CompletionTokens == nil || *u.CompletionTokens != 1 {
		t.Fatalf("usage = %+v", u)
	}
}

// Only public fields are published; a reseller's name never is.
func TestPublicModel_KeepsOnlyPublicFields(t *testing.T) {
	m := publicModel(map[string]any{
		"id": "gpt-6-sol", "display_name": "GPT-6 Sol", "owned_by": "dlab", "isFree": true,
		"provider": "dlab", "pricing": map[string]any{"in": 1},
		"capabilities": map[string]any{"contextWindow": 1050000, "vision": true, "tokenEstimator": "model"},
	})
	if m["owned_by"] != "ado" || m["object"] != "model" || m["display_name"] != "GPT-6 Sol" {
		t.Fatalf("model: %+v", m)
	}
	for _, k := range []string{"isFree", "provider", "pricing"} {
		if _, ok := m[k]; ok {
			t.Fatalf("%s should not be published", k)
		}
	}
	caps := m["capabilities"].(map[string]any)
	if _, ok := caps["tokenEstimator"]; ok || caps["vision"] != true {
		t.Fatalf("capabilities: %+v", caps)
	}
	if m := publicModel(map[string]any{"id": "deepseek-flash", "owned_by": "deepseek"}); m["owned_by"] != "deepseek" {
		t.Fatalf("a model maker's name should stay: %+v", m)
	}
	if !strings.Contains(strings.Join(modelMakers, ","), "z-ai") {
		t.Fatal("z-ai must stay a known maker (GLM models)")
	}
}
