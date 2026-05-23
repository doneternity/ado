-- +goose Up
-- seed default global quota if not already set so new keys
-- get the right limit without the admin having to explicitly save first
INSERT INTO system_settings (key, value)
VALUES ('global_daily_quota', '100')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_settings WHERE key = 'global_daily_quota';
