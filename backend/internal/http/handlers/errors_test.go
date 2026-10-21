package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"

	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
)

func TestCheckChatBody(t *testing.T) {
	for _, c := range []struct{ body, want string }{
		{``, "the request body is empty"},
		{`{"model": "x",}`, "isn't valid JSON"},
		{`"hi"`, "should be a JSON object, not string"},
		{`null`, "should be a JSON object, not null"},
		{`{"model": ["a"]}`, `"model" should be a string`},
	} {
		e := checkChatBody([]byte(c.body))
		if e == nil || !strings.Contains(e.Message, c.want) {
			t.Errorf("%q: got %v, want %q", c.body, e, c.want)
		}
	}
	if e := checkChatBody([]byte(`{"model":null,"messages":[]}`)); e != nil {
		t.Errorf("a null model is checkModel's to report, got %v", e)
	}

	for _, c := range []struct{ body, want string }{
		{`{"model":"m"}`, `"messages" is required`},
		{`{"model":"m","messages":"hi"}`, `"messages" should be a list`},
		{`{"model":"m","messages":[]}`, `"messages" is empty`},
	} {
		e := checkMessages([]byte(c.body))
		if e == nil || !strings.Contains(e.Message, c.want) {
			t.Errorf("%q: got %v, want %q", c.body, e, c.want)
		}
	}
	if e := checkMessages([]byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)); e != nil {
		t.Errorf("a good body: %v", e)
	}
}

func TestAPIPathHint(t *testing.T) {
	for path, want := range map[string]string{
		"/v1/v1/chat/completions":               "/v1 twice",
		"/v1/chat/completions/chat/completions": "not the full chat address",
		"/v1/completions":                       "older text completions",
		"/v1/chat/completion":                   "did you mean",
		"/v1":                                   "this is the base URL",
		"/v1/assistants":                        "adoai.space/docs",
	} {
		if got := apiPathHint(path); !strings.Contains(got, want) {
			t.Errorf("%s: %q, want %q", path, got, want)
		}
	}
}

func TestNoProviderNamesTheModel(t *testing.T) {
	if e := noProvider("deepseek-v4-pro"); e.Status != 503 || !strings.Contains(e.Message, `"deepseek-v4-pro" is unavailable`) {
		t.Fatalf("%+v", e)
	}
	if e := noProvider(""); strings.Contains(e.Message, `""`) {
		t.Fatalf("no model: %+v", e)
	}
}

// After a keep-alive sent 200, an error goes in the body (an event in a
// stream) and the request log gets the real status.
func TestWriteForwardError_AfterKeepAlive(t *testing.T) {
	for _, stream := range []bool{false, true} {
		w := httptest.NewRecorder()
		note := &mw.RequestNote{}
		writeForwardError(w, proxy.ForwardResult{KeptAlive: true}, note, stream, noProvider("m"))
		out := w.Body.String()
		if note.Status != 503 || !strings.Contains(out, `"code":"NO_PROVIDER"`) {
			t.Fatalf("stream=%v: status %d body %q", stream, note.Status, out)
		}
		if stream != strings.HasPrefix(out, "data: {") || stream != strings.HasSuffix(out, "}\n\n") {
			t.Fatalf("stream=%v: body %q", stream, out)
		}
	}

	// Without a keep-alive it's an ordinary error response.
	w := httptest.NewRecorder()
	writeForwardError(w, proxy.ForwardResult{}, &mw.RequestNote{}, true, noProvider("m"))
	if w.Code != 503 {
		t.Fatalf("code %d", w.Code)
	}
}
