-- +goose Up
INSERT INTO system_settings (key, value)
VALUES ('free_tier_limit', '25')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_settings WHERE key = 'free_tier_limit';
