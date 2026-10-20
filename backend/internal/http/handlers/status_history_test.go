package handlers

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

func outcome(model string, hour time.Time, ok, failed int32) db.ModelOutcomesByHourRow {
	return db.ModelOutcomesByHourRow{Model: model, Hour: pgtype.Timestamptz{Time: hour, Valid: true}, Ok: ok, Failed: failed}
}

func rateOf(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func TestBuildHistory_24h(t *testing.T) {
	now := time.Date(2026, 10, 20, 13, 30, 0, 0, time.UTC)
	rows := []db.ModelOutcomesByHourRow{
		outcome("a", time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC), 5, 0),
		outcome("a", time.Date(2026, 10, 20, 13, 0, 0, 0, time.UTC), 9, 1),
		outcome("made-up", time.Date(2026, 10, 20, 13, 0, 0, 0, time.UTC), 0, 5), // not served: never shown or counted
		outcome("a", time.Date(2026, 10, 19, 13, 0, 0, 0, time.UTC), 0, 9),       // before the window
	}
	h := buildHistory(rows, []string{"b", "a"}, now, historyRanges["24h"])

	if len(h.Buckets) != 24 || !h.Buckets[0].Equal(time.Date(2026, 10, 19, 14, 0, 0, 0, time.UTC)) || !h.Buckets[23].Equal(time.Date(2026, 10, 20, 13, 0, 0, 0, time.UTC)) {
		t.Fatalf("buckets: %d from %v to %v", len(h.Buckets), h.Buckets[0], h.Buckets[len(h.Buckets)-1])
	}
	if h.BucketMinutes != 60 {
		t.Fatalf("bucket minutes = %d", h.BucketMinutes)
	}
	if len(h.Models) != 2 || h.Models[0].ID != "a" || h.Models[1].ID != "b" {
		t.Fatalf("models: %+v", h.Models)
	}
	a := h.Models[0]
	if rateOf(a.Series[23]) != 90.0 || rateOf(a.Series[22]) != 100.0 || a.Series[0] != nil {
		t.Fatalf("a series: last=%v prev=%v first=%v", rateOf(a.Series[23]), rateOf(a.Series[22]), rateOf(a.Series[0]))
	}
	if rateOf(a.Rate) != 93.3 { // 14 of 15
		t.Fatalf("a rate = %v", rateOf(a.Rate))
	}
	b := h.Models[1]
	if b.Rate != nil || len(b.Series) != 24 || b.Series[23] != nil {
		t.Fatalf("b (served, no traffic) should be all empty: %+v", b)
	}
	if rateOf(h.Overall.Series[23]) != 90.0 || rateOf(h.Overall.Rate) != 93.3 {
		t.Fatalf("overall: last=%v rate=%v (made-up model must not count)", rateOf(h.Overall.Series[23]), rateOf(h.Overall.Rate))
	}
}

func TestBuildHistory_7dUsesSixHourSlots(t *testing.T) {
	now := time.Date(2026, 10, 20, 13, 30, 0, 0, time.UTC)
	rows := []db.ModelOutcomesByHourRow{
		outcome("a", time.Date(2026, 10, 20, 13, 0, 0, 0, time.UTC), 1, 0),
		outcome("a", time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC), 0, 1), // same 12:00-18:00 slot
		outcome("a", time.Date(2026, 10, 20, 7, 0, 0, 0, time.UTC), 3, 1),  // 06:00-12:00 slot
	}
	h := buildHistory(rows, []string{"a"}, now, historyRanges["7d"])
	if len(h.Buckets) != 28 || h.BucketMinutes != 360 || !h.Buckets[27].Equal(time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)) {
		t.Fatalf("7d buckets: %d, %d min, last %v", len(h.Buckets), h.BucketMinutes, h.Buckets[27])
	}
	s := h.Models[0].Series
	if rateOf(s[27]) != 50.0 || rateOf(s[26]) != 75.0 {
		t.Fatalf("slots: %v %v", rateOf(s[27]), rateOf(s[26]))
	}
}

func TestBuildHistory_UnknownServedListStillGivesOverall(t *testing.T) {
	now := time.Date(2026, 10, 20, 13, 30, 0, 0, time.UTC)
	rows := []db.ModelOutcomesByHourRow{outcome("a", time.Date(2026, 10, 20, 13, 0, 0, 0, time.UTC), 1, 1)}
	h := buildHistory(rows, nil, now, historyRanges["24h"])
	if len(h.Models) != 0 || rateOf(h.Overall.Rate) != 50.0 {
		t.Fatalf("models=%d overall=%v", len(h.Models), rateOf(h.Overall.Rate))
	}
}
