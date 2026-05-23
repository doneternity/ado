package proxy

import "sync/atomic"

// RpmConfig holds the global requests-per-minute limit as an atomic value.
type RpmConfig struct{ v atomic.Int32 }

func (c *RpmConfig) Get() int      { return int(c.v.Load()) }
func (c *RpmConfig) Set(n int32)   { c.v.Store(n) }
