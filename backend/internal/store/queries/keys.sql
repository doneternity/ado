-- name: CreateAdoKey :one
INSERT INTO ado_keys (user_id, key_prefix, key_hash, daily_limit)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetActiveKeyByUser :one
SELECT * FROM ado_keys WHERE user_id = $1 AND revoked_at IS NULL;

-- name: GetActiveKeyWithQuotaByUser :one
SELECT k.id, k.key_prefix, k.created_at, k.last_used_at, k.reasoning_mode,
       COALESCE(u.daily_quota_override, p.daily_quota, k.daily_limit)::int4 AS daily_limit,
       COALESCE(p.rpm, 0)::int4 AS plan_rpm,
       p.id AS plan_id, p.name AS plan_name
FROM ado_keys k
JOIN users u ON u.id = k.user_id
JOIN plans p ON p.id = u.plan_id
WHERE k.user_id = $1 AND k.revoked_at IS NULL;

-- name: GetActiveKeyByHash :one
-- Effective limits: a per-user override beats the plan, which beats the key's
-- own (global) daily limit. plan_rpm 0 means "use the global RPM".
SELECT k.id, k.user_id, k.reasoning_mode,
       COALESCE(u.daily_quota_override, p.daily_quota, k.daily_limit)::int4 AS daily_limit,
       COALESCE(p.rpm, 0)::int4 AS plan_rpm,
       u.banned
FROM ado_keys k
JOIN users u ON u.id = k.user_id
JOIN plans p ON p.id = u.plan_id
WHERE k.key_hash = $1 AND k.revoked_at IS NULL;

-- name: SetActiveKeyReasoningMode :exec
UPDATE ado_keys SET reasoning_mode = $2
WHERE user_id = $1 AND revoked_at IS NULL;

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

-- name: GetKeyUsageHistory :many
SELECT day, COALESCE(used, 0)::int4 AS used
FROM daily_usage
WHERE key_id = $1
  AND day >= CURRENT_DATE - INTERVAL '29 days'
ORDER BY day ASC;
