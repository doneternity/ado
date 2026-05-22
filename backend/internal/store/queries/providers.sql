-- name: ListProviders :many
SELECT * FROM providers ORDER BY created_at ASC;

-- name: GetProvider :one
SELECT * FROM providers WHERE id = $1;

-- name: GetActiveProvider :one
SELECT * FROM providers WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 1;

-- name: ListActiveProviders :many
SELECT id, name, base_url, api_key, is_active, created_at, updated_at, priority FROM providers WHERE is_active = TRUE ORDER BY priority ASC, created_at ASC;

-- name: CreateProvider :one
INSERT INTO providers (name, base_url, api_key, is_active, priority)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, name, base_url, api_key, is_active, created_at, updated_at, priority;

-- name: UpdateProviderMeta :one
UPDATE providers
SET name = $2, base_url = $3, priority = $4, updated_at = NOW()
WHERE id = $1
RETURNING id, name, base_url, api_key, is_active, created_at, updated_at, priority;

-- name: UpdateProviderKey :exec
UPDATE providers SET api_key = $2, updated_at = NOW() WHERE id = $1;

-- name: SetProviderActiveState :exec
UPDATE providers SET is_active = $2, updated_at = NOW() WHERE id = $1;

-- name: DeleteProvider :exec
DELETE FROM providers WHERE id = $1;

-- name: CountProviders :one
SELECT COUNT(*) FROM providers;

-- name: CountActiveProviders :one
SELECT COUNT(*) FROM providers WHERE is_active = TRUE;
