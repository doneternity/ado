package validate_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ado/ado/backend/internal/validate"
)

type testReq struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Age  int    `json:"age"`
}

// --- Bind tests ---

func TestBind_ValidJSON(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"alice","age":30}`))
	r.Header.Set("Content-Type", "application/json")
	var dst testReq
	if err := validate.Bind(r, &dst); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dst.Name != "alice" || dst.Age != 30 {
		t.Fatalf("unexpected values: %+v", dst)
	}
}

func TestBind_ContentTypeRejected(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"alice"}`))
	r.Header.Set("Content-Type", "text/plain")
	var dst testReq
	if err := validate.Bind(r, &dst); err == nil {
		t.Fatal("expected error for wrong Content-Type")
	}
}

func TestBind_EmptyBody(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(""))
	r.Header.Set("Content-Type", "application/json")
	var dst testReq
	if err := validate.Bind(r, &dst); err == nil {
		t.Fatal("expected error for empty body")
	}
}

func TestBind_InvalidJSON(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`not json`))
	r.Header.Set("Content-Type", "application/json")
	var dst testReq
	if err := validate.Bind(r, &dst); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestBind_BodySizeCap(t *testing.T) {
	big := bytes.Repeat([]byte("x"), 65*1024) // 65 KB > 64 KB default
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(big))
	r.Header.Set("Content-Type", "application/json")
	var dst testReq
	if err := validate.Bind(r, &dst); err == nil {
		t.Fatal("expected error for body exceeding cap")
	}
}

func TestBind_CustomMaxBytes(t *testing.T) {
	small := bytes.Repeat([]byte("x"), 10)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(small))
	r.Header.Set("Content-Type", "application/json")
	var dst testReq
	if err := validate.Bind(r, &dst, validate.MaxBytes(5)); err == nil {
		t.Fatal("expected error for body exceeding custom cap")
	}
}

func TestBind_BodyAtExactCap(t *testing.T) {
	// Construct a valid JSON body just at the 64 KB boundary.
	pad := bytes.Repeat([]byte("x"), 64*1024-12)
	body := append([]byte(`{"name":"`), append(pad, []byte(`"}`)...)...)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	var dst testReq
	err := validate.Bind(r, &dst)
	if err != nil && err.Error() == "request body too large" {
		t.Fatalf("64 KB body should not be rejected as too large, got: %v", err)
	}
}

func TestBind_GETSkipsContentTypeCheck(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", strings.NewReader(`{"name":"x"}`))
	// No Content-Type header — GET should not enforce it
	var dst testReq
	if err := validate.Bind(r, &dst); err != nil {
		t.Fatalf("GET should not require Content-Type, got: %v", err)
	}
}

// --- Fields tests ---

func TestFields_Required(t *testing.T) {
	v := validate.Fields()
	v.Field("name", "").Required()
	if err := v.Err(); err == nil {
		t.Fatal("expected error for empty required field")
	}
}

func TestFields_Required_Whitespace(t *testing.T) {
	v := validate.Fields()
	v.Field("name", "   ").Required()
	if err := v.Err(); err == nil {
		t.Fatal("expected error for whitespace-only required field")
	}
}

func TestFields_MaxLen(t *testing.T) {
	v := validate.Fields()
	v.Field("name", "toolong").MaxLen(3)
	if err := v.Err(); err == nil {
		t.Fatal("expected error for field exceeding MaxLen")
	}
}

func TestFields_MaxLen_OK(t *testing.T) {
	v := validate.Fields()
	v.Field("name", "ok").MaxLen(10)
	if err := v.Err(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFields_MinLen(t *testing.T) {
	v := validate.Fields()
	v.Field("name", "ab").MinLen(5)
	if err := v.Err(); err == nil {
		t.Fatal("expected error for field below MinLen")
	}
}

func TestFields_URL_Valid(t *testing.T) {
	v := validate.Fields()
	v.Field("url", "https://example.com").URL()
	if err := v.Err(); err != nil {
		t.Fatalf("unexpected error for valid URL: %v", err)
	}
}

func TestFields_URL_Invalid(t *testing.T) {
	v := validate.Fields()
	v.Field("url", "not-a-url").URL()
	if err := v.Err(); err == nil {
		t.Fatal("expected error for invalid URL")
	}
}

func TestFields_URL_NoScheme(t *testing.T) {
	v := validate.Fields()
	v.Field("url", "example.com").URL()
	if err := v.Err(); err == nil {
		t.Fatal("expected error for URL without scheme")
	}
}

func TestFields_OneOf_Valid(t *testing.T) {
	v := validate.Fields()
	v.Field("role", "admin").OneOf("user", "admin")
	if err := v.Err(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFields_OneOf_Invalid(t *testing.T) {
	v := validate.Fields()
	v.Field("role", "superadmin").OneOf("user", "admin")
	if err := v.Err(); err == nil {
		t.Fatal("expected error for value not in OneOf set")
	}
}

func TestFields_FirstErrorOnly(t *testing.T) {
	v := validate.Fields()
	v.Field("a", "").Required()
	v.Field("b", "").Required()
	if err := v.Err(); err == nil {
		t.Fatal("expected error")
	}
	msg := v.Err().Error()
	if strings.Contains(msg, "b") {
		t.Fatalf("expected only first error (about 'a'), got: %s", msg)
	}
}
