package handlers

// System setting keys stored in the system_settings table.
const (
	settingGlobalDailyQuota = "global_daily_quota"
	settingGlobalRPM        = "global_rpm_limit"
	settingMaintenanceMode  = "maintenance_mode"
	settingFreeTierLimit    = "free_tier_limit"
	// RFC 3339 time until which the inactive-key reaper stays paused after
	// maintenance mode ends (see ReapInactiveKeys).
	settingReaperGraceUntil = "reaper_grace_until"
)
