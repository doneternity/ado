-- name: GetSetting :one
SELECT value FROM system_settings WHERE key = $1;

-- name: SetSetting :exec
INSERT INTO system_settings (key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
