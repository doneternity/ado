-- name: ListUsersAdmin :many
SELECT u.id, u.email, u.display_name, u.role, u.banned, u.created_at, u.daily_quota_override,
       COALESCE(SUM(du.used), 0)::int4 AS requests_today
FROM users u
LEFT JOIN ado_keys k ON k.user_id = u.id
LEFT JOIN daily_usage du ON du.key_id = k.id AND du.day = CURRENT_DATE
GROUP BY u.id
ORDER BY u.created_at DESC;

-- name: SetUserRole :exec
UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1;

-- name: SetUserBanned :exec
UPDATE users SET banned = $2, updated_at = NOW() WHERE id = $1;

-- name: SetUserQuotaOverride :exec
UPDATE users SET daily_quota_override = $2, updated_at = NOW() WHERE id = $1;

-- name: RemoveUserQuotaOverride :exec
UPDATE users SET daily_quota_override = NULL, updated_at = NOW() WHERE id = $1;

-- name: SetAllKeyDailyLimits :exec
UPDATE ado_keys SET daily_limit = $1
WHERE revoked_at IS NULL
  AND user_id IN (SELECT id FROM users WHERE daily_quota_override IS NULL);

-- name: SetUserKeyDailyLimit :exec
UPDATE ado_keys SET daily_limit = $2
WHERE revoked_at IS NULL AND user_id = $1;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: DailyRequestCounts :many
SELECT day, SUM(used)::int4 AS total
FROM daily_usage
WHERE day >= CURRENT_DATE - INTERVAL '29 days'
GROUP BY day
ORDER BY day ASC;

-- name: TopUsersByUsageThisMonth :many
SELECT u.email, COALESCE(SUM(du.used), 0)::int4 AS total
FROM users u
LEFT JOIN ado_keys k ON k.user_id = u.id
LEFT JOIN daily_usage du ON du.key_id = k.id
  AND du.day >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY u.id, u.email
ORDER BY total DESC
LIMIT 10;

-- name: CountFreeTierUsers :one
SELECT COUNT(DISTINCT k.user_id)::int4 AS count
FROM ado_keys k
JOIN users u ON u.id = k.user_id
WHERE k.revoked_at IS NULL
  AND u.role = 'user';

-- name: RevokeInactiveKeys :exec
UPDATE ado_keys
SET revoked_at = NOW()
WHERE revoked_at IS NULL
  AND user_id IN (SELECT id FROM users WHERE role = 'user')
  AND (
    last_used_at < $1
    OR (last_used_at IS NULL AND created_at < $1)
  );
