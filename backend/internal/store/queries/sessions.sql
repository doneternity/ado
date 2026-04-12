-- name: CreateSession :one
INSERT INTO sessions (id, user_id, csrf_token, expires_at, user_agent, ip)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions WHERE id = $1 AND expires_at > now();

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = now()
WHERE id = $1 AND last_seen_at < now() - interval '30 seconds';

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = $1;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at < now();
