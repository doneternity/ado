package apperr

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWrite_StatusAndBody(t *testing.T) {
	rr := httptest.NewRecorder()
	Write(rr, BadRequest("INVALID_INPUT", "bad email"))

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", rr.Code)
	}
	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "INVALID_INPUT" || body.Error.Message != "bad email" {
		t.Fatalf("body=%+v", body)
	}
}

func TestWrite_UnknownErrorIs500(t *testing.T) {
	rr := httptest.NewRecorder()
	Write(rr, errBoom{})
	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d, want 500", rr.Code)
	}
}

type errBoom struct{}
func (errBoom) Error() string { return "boom" }
