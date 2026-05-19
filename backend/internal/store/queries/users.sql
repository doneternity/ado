-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: CreateUser :one
INSERT INTO users (email, email_verified, password_hash, google_sub, display_name, photo_url, role)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByGoogleSub :one
SELECT * FROM users WHERE google_sub = $1;

-- name: SetEmailVerified :exec
UPDATE users SET email_verified = TRUE, updated_at = now() WHERE id = $1;

-- name: LinkGoogleSub :exec
UPDATE users
SET google_sub = sqlc.arg(google_sub),
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
