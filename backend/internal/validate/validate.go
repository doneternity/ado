package validate

import (
	"encoding/json"
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
			return fmt.Errorf("Content-Type must be application/json")
		}
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, o.maxBytes+1))
	if err != nil {
		return fmt.Errorf("could not read request body")
	}
	if int64(len(data)) > o.maxBytes {
		return fmt.Errorf("request body too large")
	}
	if len(data) == 0 {
		return fmt.Errorf("request body is empty")
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return fmt.Errorf("invalid JSON")
	}
	return nil
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
