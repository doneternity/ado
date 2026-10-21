package handlers

import (
	"context"
	"math"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/store/db"
)

// Public success-rate history for the Status page, built from request_log:
// for each model ADO serves, the share of requests that succeeded in each
// time slot. Only percentages go out, never request counts, and only for
// models in the live list, so made-up model names users send never appear.

type historyRange struct {
	name    string
	bucket  time.Duration
	buckets int
}

var historyRanges = map[string]historyRange{
	"24h": {name: "24h", bucket: time.Hour, buckets: 24},
	"7d":  {name: "7d", bucket: 6 * time.Hour, buckets: 28},
}

// How long a computed history is served before it's read again.
const historyCacheTTL = time.Minute

type modelHistoryDTO struct {
	ID     string     `json:"id"`
	Rate   *float64   `json:"rate"`   // whole range; null when there was no traffic
	Series []*float64 `json:"series"` // one per bucket, oldest first; null = no traffic
}

type statusHistoryDTO struct {
	Range         string            `json:"range"`
	BucketMinutes int               `json:"bucketMinutes"`
	Buckets       []time.Time       `json:"buckets"` // start of each slot, oldest first
	Overall       modelHistoryDTO   `json:"overall"`
	Models        []modelHistoryDTO `json:"models"`
	GeneratedAt   time.Time         `json:"generatedAt"`
}

type StatusHistory struct {
	q      *db.Queries
	served func(context.Context) []string // model IDs currently served

	mu    sync.Mutex
	cache map[string]cachedHistory
}

type cachedHistory struct {
	at   time.Time
	data statusHistoryDTO
}

func NewStatusHistory(q *db.Queries, served func(context.Context) []string) *StatusHistory {
	return &StatusHistory{q: q, served: served, cache: map[string]cachedHistory{}}
}

// Public: GET /api/status/history?range=24h|7d
func (h *StatusHistory) Public(w http.ResponseWriter, r *http.Request) {
	rng, ok := historyRanges[r.URL.Query().Get("range")]
	if !ok {
		rng = historyRanges["24h"]
	}

	h.mu.Lock()
	c, hit := h.cache[rng.name]
	h.mu.Unlock()
	if hit && time.Since(c.at) < historyCacheTTL {
		writeJSON(w, c.data)
		return
	}

	now := time.Now()
	start := historyStart(now, rng)
	rows, err := h.q.ModelOutcomesByHour(r.Context(), pgtype.Timestamptz{Time: start, Valid: true})
	if err != nil {
		apperr.Write(w, apperr.Internal("INTERNAL", "couldn't load the status history; try again in a moment"))
		return
	}
	data := buildHistory(rows, h.served(r.Context()), now, rng)

	h.mu.Lock()
	h.cache[rng.name] = cachedHistory{at: now, data: data}
	h.mu.Unlock()
	writeJSON(w, data)
}

// historyStart is the start of the oldest slot. Slots line up with UTC
// boundaries (whole hours, or 00/06/12/18h), and the last one holds now.
func historyStart(now time.Time, rng historyRange) time.Time {
	current := now.UTC().Truncate(rng.bucket)
	return current.Add(-time.Duration(rng.buckets-1) * rng.bucket)
}

type tally struct{ ok, failed int64 }

func (t tally) rate() *float64 {
	total := t.ok + t.failed
	if total == 0 {
		return nil
	}
	r := math.Round(float64(t.ok)/float64(total)*1000) / 10 // one decimal
	return &r
}

// buildHistory turns hourly per-model outcomes into slot-by-slot success
// rates for the served models, plus an overall line across them. When the
// served list is unknown (empty), every model in the rows counts toward the
// overall line but none is listed by name.
func buildHistory(rows []db.ModelOutcomesByHourRow, served []string, now time.Time, rng historyRange) statusHistoryDTO {
	start := historyStart(now, rng)
	isServed := make(map[string]bool, len(served))
	for _, id := range served {
		isServed[id] = true
	}

	perModel := map[string][]tally{}
	overall := make([]tally, rng.buckets)
	for _, row := range rows {
		idx := int(row.Hour.Time.Sub(start) / rng.bucket)
		if idx < 0 || idx >= rng.buckets {
			continue
		}
		if len(served) > 0 && !isServed[row.Model] {
			continue
		}
		overall[idx].ok += int64(row.Ok)
		overall[idx].failed += int64(row.Failed)
		if len(served) == 0 {
			continue
		}
		s := perModel[row.Model]
		if s == nil {
			s = make([]tally, rng.buckets)
			perModel[row.Model] = s
		}
		s[idx].ok += int64(row.Ok)
		s[idx].failed += int64(row.Failed)
	}

	series := func(ts []tally) modelHistoryDTO {
		var sum tally
		out := make([]*float64, len(ts))
		for i, t := range ts {
			out[i] = t.rate()
			sum.ok += t.ok
			sum.failed += t.failed
		}
		return modelHistoryDTO{Rate: sum.rate(), Series: out}
	}

	dto := statusHistoryDTO{
		Range:         rng.name,
		BucketMinutes: int(rng.bucket / time.Minute),
		Buckets:       make([]time.Time, rng.buckets),
		Overall:       series(overall),
		Models:        []modelHistoryDTO{},
		GeneratedAt:   now.UTC(),
	}
	for i := range dto.Buckets {
		dto.Buckets[i] = start.Add(time.Duration(i) * rng.bucket)
	}

	ids := append([]string(nil), served...)
	sort.Strings(ids)
	for _, id := range ids {
		ts := perModel[id]
		if ts == nil {
			ts = make([]tally, rng.buckets) // served but no traffic yet: all slots empty
		}
		m := series(ts)
		m.ID = id
		dto.Models = append(dto.Models, m)
	}
	return dto
}
