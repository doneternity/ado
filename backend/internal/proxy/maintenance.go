package proxy

import "sync/atomic"

// MaintenanceFlag is a thread-safe toggle for maintenance mode.
type MaintenanceFlag struct {
	v atomic.Bool
}

func (m *MaintenanceFlag) Enabled() bool { return m.v.Load() }
func (m *MaintenanceFlag) Set(on bool)   { m.v.Store(on) }
