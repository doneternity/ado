-- name: CreateAdoKey :one
INSERT INTO ado_keys (user_id, key_prefix, key_hash, daily_limit)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetActiveKeyByUser :one
SELECT * FROM ado_keys WHERE user_id = $1 AND revoked_at IS NULL;

-- name: GetActiveKeyByHash :one
SELECT k.id, k.user_id,
       COALESCE(u.daily_quota_override, k.daily_limit)::int4 AS daily_limit,
       u.banned
FROM ado_keys k
JOIN users u ON u.id = k.user_id
WHERE k.key_hash = $1 AND k.revoked_at IS NULL;

-- name: RevokeActiveKeyForUser :exec
UPDATE ado_keys SET revoked_at = now()
WHERE user_id = $1 AND revoked_at IS NULL;

-- name: TouchKeyLastUsed :exec
UPDATE ado_keys SET last_used_at = now()
WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '30 seconds');

-- name: GetUsageForToday :one
SELECT COALESCE(used, 0)::int4 AS used
FROM daily_usage
WHERE key_id = $1 AND day = CURRENT_DATE;
