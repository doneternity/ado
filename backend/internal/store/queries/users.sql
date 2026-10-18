-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: CreateUser :one
INSERT INTO users (email, email_verified, password_hash, google_sub, discord_id, display_name, photo_url, role)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByGoogleSub :one
SELECT * FROM users WHERE google_sub = $1;

-- name: GetUserByDiscordID :one
SELECT * FROM users WHERE discord_id = $1;

-- name: SetEmailVerified :exec
UPDATE users SET email_verified = TRUE, updated_at = now() WHERE id = $1;

-- name: LinkGoogleSub :exec
UPDATE users
SET google_sub = sqlc.arg(google_sub),
    photo_url = COALESCE(NULLIF(sqlc.arg(photo_url),''), photo_url),
    display_name = COALESCE(NULLIF(sqlc.arg(display_name),''), display_name),
    updated_at = now()
WHERE id = sqlc.arg(id);

-- name: LinkDiscordID :exec
UPDATE users
SET discord_id = sqlc.arg(discord_id),
    photo_url = COALESCE(NULLIF(sqlc.arg(photo_url),''), photo_url),
    display_name = COALESCE(NULLIF(sqlc.arg(display_name),''), display_name),
    updated_at = now()
WHERE id = sqlc.arg(id);

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: HasAdmin :one
SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin') AS has_admin;

-- name: CreateEmailVerificationToken :exec
INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
VALUES ($1, $2, $3);

-- name: GetEmailVerificationToken :one
SELECT * FROM email_verification_tokens WHERE token_hash = $1;

-- name: ConsumeEmailVerificationToken :exec
UPDATE email_verification_tokens SET consumed_at = now() WHERE token_hash = $1;

-- name: DeleteEmailVerificationTokensForUser :exec
DELETE FROM email_verification_tokens WHERE user_id = $1;

-- name: TouchUserLogin :exec
UPDATE users SET last_login_at = now() WHERE id = $1;

-- name: ListInactiveUsers :many
-- Accounts with no sign-in, session or API activity since the cutoff. Admins,
-- banned users (deleting them would lift the ban) and anyone on a plan other
-- than free are never included.
SELECT u.id, u.email, u.created_at, a.last_active::timestamptz AS last_active
FROM users u
CROSS JOIN LATERAL (
  SELECT GREATEST(
    u.created_at,
    u.last_login_at,
    (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id),
    (SELECT MAX(GREATEST(k.created_at, k.last_used_at)) FROM ado_keys k WHERE k.user_id = u.id)
  ) AS last_active
) a
WHERE u.role <> 'admin' AND NOT u.banned AND u.plan_id = 'free'
  AND a.last_active < sqlc.arg(cutoff)::timestamptz
ORDER BY a.last_active ASC;

-- name: DeleteInactiveUsers :execrows
-- Deletes only the listed users, and only if they are still inactive by the
-- same rules, so someone who signed in after the preview is kept. Keys,
-- sessions, usage and request logs go with them (ON DELETE CASCADE).
DELETE FROM users u
WHERE u.id = ANY(sqlc.arg(ids)::uuid[])
  AND u.role <> 'admin' AND NOT u.banned AND u.plan_id = 'free'
  AND GREATEST(
    u.created_at,
    u.last_login_at,
    (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id),
    (SELECT MAX(GREATEST(k.created_at, k.last_used_at)) FROM ado_keys k WHERE k.user_id = u.id)
  ) < sqlc.arg(cutoff)::timestamptz;
