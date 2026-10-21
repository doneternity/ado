package handlers

import (
	"encoding/json"
	"testing"
)

func messages(t *testing.T, body []byte) []map[string]any {
	t.Helper()
	var p map[string]any
	if err := json.Unmarshal(body, &p); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	raw, _ := p["messages"].([]any)
	out := make([]map[string]any, len(raw))
	for i, m := range raw {
		out[i], _ = m.(map[string]any)
	}
	return out
}

func TestInjectReasoning_PrependsSystemWhenNone(t *testing.T) {
	body := []byte(`{"model":"x","messages":[{"role":"user","content":"hi"}]}`)
	got := messages(t, injectReasoning(body))
	if len(got) != 2 {
		t.Fatalf("want 2 messages, got %d", len(got))
	}
	if got[0]["role"] != "system" {
		t.Fatalf("first message should be system, got %v", got[0]["role"])
	}
	if got[0]["content"] != reasoningInstruction {
		t.Fatalf("system content = %q", got[0]["content"])
	}
	if got[1]["role"] != "user" {
		t.Fatalf("user message should be preserved")
	}
}

func TestInjectReasoning_AppendsToExistingSystem(t *testing.T) {
	body := []byte(`{"model":"x","messages":[{"role":"system","content":"You are a cat."},{"role":"user","content":"hi"}]}`)
	got := messages(t, injectReasoning(body))
	if len(got) != 2 {
		t.Fatalf("want 2 messages (no new one added), got %d", len(got))
	}
	c, _ := got[0]["content"].(string)
	if c == "You are a cat." || c == reasoningInstruction {
		t.Fatalf("expected appended content, got %q", c)
	}
	if want := "You are a cat.\n\n" + reasoningInstruction; c != want {
		t.Fatalf("content = %q, want %q", c, want)
	}
}

func TestInjectReasoning_MalformedPassThrough(t *testing.T) {
	body := []byte(`not json`)
	if got := injectReasoning(body); string(got) != "not json" {
		t.Fatalf("malformed body should pass through unchanged, got %q", got)
	}

	// Valid JSON without a messages array is left alone too.
	noMsgs := []byte(`{"model":"x"}`)
	if got := injectReasoning(noMsgs); string(got) != string(noMsgs) {
		t.Fatalf("body without messages should pass through, got %q", got)
	}
}

// Only the messages change: other fields keep their exact JSON, so a large
// integer like a seed isn't rounded through float64.
func TestInjectReasoning_KeepsOtherFieldsExact(t *testing.T) {
	body := []byte(`{"model":"x","seed":9007199254740993,"temperature":0.7,"messages":[{"role":"user","content":"hi","name":"bob"}]}`)
	out := injectReasoning(body)
	var p map[string]json.RawMessage
	if err := json.Unmarshal(out, &p); err != nil {
		t.Fatal(err)
	}
	if string(p["seed"]) != "9007199254740993" || string(p["temperature"]) != "0.7" {
		t.Fatalf("fields changed: seed=%s temperature=%s", p["seed"], p["temperature"])
	}
	got := messages(t, out)
	if len(got) != 2 || got[1]["name"] != "bob" {
		t.Fatalf("messages: %+v", got)
	}
}
