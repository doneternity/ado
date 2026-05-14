package apperr

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

type Error struct {
	Status  int            `json:"-"`
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Extra   map[string]any `json:"-"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func New(status int, code, msg string) *Error {
	return &Error{Status: status, Code: code, Message: msg}
}

func BadRequest(code, msg string) *Error   { return New(http.StatusBadRequest, code, msg) }
func Unauthorized(code, msg string) *Error { return New(http.StatusUnauthorized, code, msg) }
func Forbidden(code, msg string) *Error    { return New(http.StatusForbidden, code, msg) }
func NotFound(code, msg string) *Error     { return New(http.StatusNotFound, code, msg) }
func Conflict(code, msg string) *Error     { return New(http.StatusConflict, code, msg) }
func TooMany(code, msg string) *Error      { return New(http.StatusTooManyRequests, code, msg) }
func Internal(code, msg string) *Error          { return New(http.StatusInternalServerError, code, msg) }
func ServiceUnavailable(code, msg string) *Error { return New(http.StatusServiceUnavailable, code, msg) }

func (e *Error) WithExtra(k string, v any) *Error {
	if e.Extra == nil {
		e.Extra = map[string]any{}
	}
	e.Extra[k] = v
	return e
}

func Write(w http.ResponseWriter, err error) {
	var ae *Error
	if !errors.As(err, &ae) {
		slog.Error("unexpected error", "err", err)
		ae = Internal("INTERNAL", "internal error")
	}

	body := map[string]any{
		"error": map[string]any{"code": ae.Code, "message": ae.Message},
	}
	if len(ae.Extra) > 0 {
		errMap := body["error"].(map[string]any)
		for k, v := range ae.Extra {
			errMap[k] = v
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(ae.Status)
	_ = json.NewEncoder(w).Encode(body)
}
