-- name: InsertErrorLog :exec
INSERT INTO error_logs (level, message, context) VALUES ($1, $2, $3);

-- name: ListErrorLogs :many
SELECT * FROM error_logs
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountErrorLogs :one
SELECT COUNT(*) FROM error_logs;

-- name: DeleteErrorLog :exec
DELETE FROM error_logs WHERE id = $1;

-- name: DeleteOldErrorLogs :exec
DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1;

-- name: CountErrorLogsSince :one
-- Split by where the error came from: website crash reports carry
-- context.source = 'frontend', everything else is a server 5xx.
SELECT
  COUNT(*) FILTER (WHERE context->>'source' = 'frontend')                AS frontend,
  COUNT(*) FILTER (WHERE context->>'source' IS DISTINCT FROM 'frontend') AS server
FROM error_logs
WHERE created_at > $1;
