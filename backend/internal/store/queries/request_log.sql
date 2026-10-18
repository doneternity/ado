-- name: InsertRequestLog :exec
INSERT INTO request_log (user_id, key_id, endpoint, model, status, duration_ms, stream, provider, prompt_tokens, completion_tokens)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

-- name: DeleteOldRequestLogs :exec
DELETE FROM request_log WHERE created_at < now() - make_interval(days => sqlc.arg(days)::int);

-- name: ListRecentRequests :many
-- Newest first; filter by user email when one is given.
SELECT r.id, r.created_at, u.email, r.endpoint, r.model, r.status, r.duration_ms,
       r.stream, r.provider, r.prompt_tokens, r.completion_tokens
FROM request_log r
JOIN users u ON u.id = r.user_id
WHERE (sqlc.narg(email)::text IS NULL OR u.email = sqlc.narg(email)::text)
ORDER BY r.created_at DESC
LIMIT sqlc.arg(row_limit);

-- name: UsageByModel :many
-- Per-model totals since a point in time, across all users.
SELECT COALESCE(model, '')::text AS model,
       COUNT(*)::int4 AS requests,
       COUNT(*) FILTER (WHERE status BETWEEN 200 AND 299)::int4 AS ok,
       COALESCE(SUM(prompt_tokens), 0)::int8 AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0)::int8 AS completion_tokens,
       COALESCE(AVG(duration_ms), 0)::int4 AS avg_ms
FROM request_log
WHERE created_at >= sqlc.arg(since)
GROUP BY model
ORDER BY requests DESC;

-- name: UserUsageByModel :many
-- Per-model totals for one user since a point in time.
SELECT COALESCE(model, '')::text AS model,
       COUNT(*)::int4 AS requests,
       COUNT(*) FILTER (WHERE status BETWEEN 200 AND 299)::int4 AS ok,
       COALESCE(SUM(prompt_tokens), 0)::int8 AS prompt_tokens,
       COALESCE(SUM(completion_tokens), 0)::int8 AS completion_tokens
FROM request_log
WHERE user_id = sqlc.arg(user_id) AND created_at >= sqlc.arg(since)
GROUP BY model
ORDER BY requests DESC;
