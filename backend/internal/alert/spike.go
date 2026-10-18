package alert

import (
	"fmt"
	"time"
)

// ErrorSpike decides when a burst of logged errors is worth an alert. It fires
// once when either count reaches its threshold, then stays quiet for Cooldown
// so an ongoing outage doesn't flood the channel. Not safe for concurrent use;
// call Observe from one goroutine.
type ErrorSpike struct {
	ServerThreshold   int64 // 5xx responses per window
	FrontendThreshold int64 // website crash reports per window
	Cooldown          time.Duration
	Send              func(msg string)

	lastSent time.Time
}

// Observe takes the error counts for the window that ended at now and reports
// whether it sent an alert.
func (s *ErrorSpike) Observe(now time.Time, window time.Duration, server, frontend int64) bool {
	if server < s.ServerThreshold && frontend < s.FrontendThreshold {
		return false
	}
	if !s.lastSent.IsZero() && now.Sub(s.lastSent) < s.Cooldown {
		return false
	}
	s.lastSent = now
	s.Send(fmt.Sprintf(
		"**[ERRORS] %d server errors and %d website crashes in the last %d minutes.** Details are in Admin > Errors.",
		server, frontend, int(window.Minutes()),
	))
	return true
}
