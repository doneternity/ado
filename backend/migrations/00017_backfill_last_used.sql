-- +goose Up
-- last_used_at was never written before this release, so it's null everywhere.
-- seed active keys to now() so the reaper gives them a fresh window instead of
-- revoking them all on its next run.
UPDATE ado_keys SET last_used_at = now()
WHERE revoked_at IS NULL AND last_used_at IS NULL;

-- +goose Down
SELECT 1;
