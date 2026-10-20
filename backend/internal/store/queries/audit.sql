-- name: InsertAuditLog :exec
INSERT INTO admin_audit_log (actor_id, actor_label, action, target, details)
VALUES ($1, $2, $3, $4, $5);

-- name: ListAuditLog :many
-- Newest first, a page at a time: pass the last id seen as before_id (0 for
-- the first page).
SELECT id, created_at, actor_label, action, target, details
FROM admin_audit_log
WHERE (sqlc.arg(before_id)::bigint = 0 OR id < sqlc.arg(before_id)::bigint)
ORDER BY id DESC
LIMIT sqlc.arg(row_limit);

-- name: DeleteOldAuditLogs :exec
DELETE FROM admin_audit_log WHERE created_at < now() - make_interval(days => sqlc.arg(days)::int);
