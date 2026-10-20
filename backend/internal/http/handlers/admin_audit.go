package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

// AdminAudit lists admin_audit_log, which middleware.Audit fills.
type AdminAudit struct{ q *db.Queries }

func NewAdminAudit(q *db.Queries) *AdminAudit { return &AdminAudit{q: q} }

type auditEntryDTO struct {
	ID        int64           `json:"id"`
	CreatedAt time.Time       `json:"createdAt"`
	Actor     string          `json:"actor"`
	Action    string          `json:"action"`
	Target    string          `json:"target"`
	Details   json.RawMessage `json:"details"`
}

// List: GET /api/admin/audit?before=<id>&limit=<n>, newest first. Pass the
// last id of a page as before to get the next one.
func (h *AdminAudit) List(w http.ResponseWriter, r *http.Request) {
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	if before < 0 {
		before = 0
	}
	rows, err := h.q.ListAuditLog(r.Context(), db.ListAuditLogParams{
		BeforeID: before, RowLimit: int32(intParam(r, "limit", 50, 200)),
	})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "list audit log"))
		return
	}
	out := make([]auditEntryDTO, len(rows))
	for i, row := range rows {
		details := json.RawMessage(row.Details)
		if len(details) == 0 {
			details = json.RawMessage("{}")
		}
		out[i] = auditEntryDTO{
			ID: row.ID, CreatedAt: row.CreatedAt.Time, Actor: row.ActorLabel,
			Action: row.Action, Target: row.Target, Details: details,
		}
	}
	writeJSON(w, out)
}
