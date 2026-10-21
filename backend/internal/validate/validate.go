package validate

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const defaultMaxBytes int64 = 64 * 1024

// Option configures Bind behaviour.
type Option func(*bindOptions)

type bindOptions struct{ maxBytes int64 }

// MaxBytes overrides the default 64 KB body size cap.
func MaxBytes(n int64) Option { return func(o *bindOptions) { o.maxBytes = n } }

// Bind decodes the JSON request body into dst.
// It enforces Content-Type: application/json on POST/PUT/PATCH, caps body
// size, and returns a descriptive error safe to surface to clients.
func Bind[T any](r *http.Request, dst *T, opts ...Option) error {
	o := bindOptions{maxBytes: defaultMaxBytes}
	for _, opt := range opts {
		opt(&o)
	}
	m := r.Method
	if m == http.MethodPost || m == http.MethodPut || m == http.MethodPatch {
		if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			return fmt.Errorf("the Content-Type header must be application/json")
		}
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, o.maxBytes+1))
	if err != nil {
		return fmt.Errorf("could not read the request body")
	}
	if int64(len(data)) > o.maxBytes {
		return fmt.Errorf("the request body is too large (%s at most)", Size(o.maxBytes))
	}
	if len(data) == 0 {
		return fmt.Errorf("the request body is empty")
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return errors.New(JSONError(err))
	}
	return nil
}

// JSONError describes a json.Unmarshal error for the client: where the
// syntax breaks, or which field has the wrong type.
func JSONError(err error) string {
	var se *json.SyntaxError
	var te *json.UnmarshalTypeError
	switch {
	case errors.As(err, &se):
		return fmt.Sprintf("the request body isn't valid JSON: %s (at character %d)", se.Error(), se.Offset)
	case errors.As(err, &te) && te.Field != "":
		return fmt.Sprintf("%q should be %s, not %s", te.Field, jsonKind(te.Type.Kind().String()), te.Value)
	case errors.As(err, &te):
		return fmt.Sprintf("the request body should be a JSON object, not %s", te.Value)
	case errors.Is(err, io.ErrUnexpectedEOF):
		return "the request body isn't valid JSON: it ends too early"
	default:
		return "the request body isn't valid JSON"
	}
}

func jsonKind(goKind string) string {
	switch goKind {
	case "string":
		return "a string"
	case "bool":
		return "true or false"
	case "slice", "array":
		return "a list"
	case "map", "struct":
		return "an object"
	case "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "float32", "float64":
		return "a number"
	default:
		return "a different type"
	}
}

// Size formats a byte limit for messages: "64 KB", "16 MB".
func Size(n int64) string {
	if n >= 1<<20 {
		return fmt.Sprintf("%d MB", n>>20)
	}
	return fmt.Sprintf("%d KB", n>>10)
}

// Fields returns a new Validator for fluent field checks.
func Fields() *Validator { return &Validator{} }

// Validator accumulates field validation errors. Err returns the first error.
type Validator struct{ errs []string }

// Err returns the first validation error, or nil if all fields passed.
func (v *Validator) Err() error {
	if len(v.errs) == 0 {
		return nil
	}
	return fmt.Errorf("%s", v.errs[0])
}

// Field starts a fluent chain for the named field with the given string value.
func (v *Validator) Field(name, value string) *FieldValidator {
	return &FieldValidator{v: v, name: name, val: value}
}

// FieldValidator chains validation rules for a single field.
type FieldValidator struct {
	v    *Validator
	name string
	val  string
}

// Required fails if the value is empty or whitespace-only.
func (f *FieldValidator) Required() *FieldValidator {
	if strings.TrimSpace(f.val) == "" {
		f.v.errs = append(f.v.errs, f.name+" is required")
	}
	return f
}

// MaxLen fails if the value exceeds n bytes.
func (f *FieldValidator) MaxLen(n int) *FieldValidator {
	if len(f.val) > n {
		f.v.errs = append(f.v.errs, fmt.Sprintf("%s must be %d bytes or fewer", f.name, n))
	}
	return f
}

// MinLen fails if the value is shorter than n bytes.
func (f *FieldValidator) MinLen(n int) *FieldValidator {
	if len(f.val) < n {
		f.v.errs = append(f.v.errs, fmt.Sprintf("%s must be at least %d bytes", f.name, n))
	}
	return f
}

// URL fails if the value is non-empty and not a valid http/https URL.
func (f *FieldValidator) URL() *FieldValidator {
	if f.val == "" {
		return f
	}
	u, err := url.ParseRequestURI(f.val)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		f.v.errs = append(f.v.errs, f.name+" must be a valid http/https URL")
	}
	return f
}

// OneOf fails if the value is not in the allowed set.
func (f *FieldValidator) OneOf(allowed ...string) *FieldValidator {
	for _, a := range allowed {
		if f.val == a {
			return f
		}
	}
	f.v.errs = append(f.v.errs, fmt.Sprintf("%s must be one of: %s", f.name, strings.Join(allowed, ", ")))
	return f
}
