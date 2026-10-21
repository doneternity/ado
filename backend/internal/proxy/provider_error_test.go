package proxy

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProviderErrorText_Shapes(t *testing.T) {
	for _, c := range []struct{ body, msg, code string }{
		{`{"error":{"message":"context too long","type":"invalid_request_error","code":"context_length_exceeded"}}`, "context too long", "context_length_exceeded"},
		{`{"error":{"message":"bad","code":400}}`, "bad", ""}, // numeric codes aren't kept
		{`{"error":"model is overloaded"}`, "model is overloaded", ""},
		{`{"message":"Invalid temperature"}`, "Invalid temperature", ""},
		{`{"detail":"Not allowed"}`, "Not allowed", ""},
		{`{"detail":[{"loc":["body","messages"],"msg":"field required"}]}`, "field required", ""},
		{`Bad request: max_tokens too large`, "Bad request: max_tokens too large", ""},
		{`<html><body>404</body></html>`, "", ""},
		{``, "", ""},
	} {
		msg, code := providerErrorText([]byte(c.body))
		if msg != c.msg || code != c.code {
			t.Errorf("%s: got %q/%q, want %q/%q", c.body, msg, code, c.msg, c.code)
		}
	}
}

func TestWriteProviderError_ADOFormat(t *testing.T) {
	resp := &http.Response{
		StatusCode: 400,
		Body:       io.NopCloser(strings.NewReader(`{"detail":"gpt-6-sol-thanks-somewhere: max_tokens is too large"}`)),
	}
	w := httptest.NewRecorder()
	writeProviderError(w, resp, false, false, "gpt-6-sol-thanks-somewhere", "gpt-6-sol")
	var out struct {
		Error struct{ Code, Message, Type string } `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if w.Code != 400 || w.Header().Get("Content-Type") != "application/json" ||
		out.Error.Code != "PROVIDER_ERROR" || out.Error.Type != "invalid_request_error" ||
		out.Error.Message != "gpt-6-sol: max_tokens is too large" {
		t.Fatalf("%d %+v", w.Code, out.Error)
	}

	// An HTML error page becomes a plain message with the status.
	resp = &http.Response{StatusCode: 404, Body: io.NopCloser(strings.NewReader("<html>nope</html>"))}
	w = httptest.NewRecorder()
	writeProviderError(w, resp, false, false, "m", "m")
	if w.Code != 404 || !strings.Contains(w.Body.String(), "turned the request down (HTTP 404)") || !strings.Contains(w.Body.String(), `"type":"not_found_error"`) {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}
