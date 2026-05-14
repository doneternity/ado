-- name: ListProviders :many
SELECT * FROM providers ORDER BY created_at ASC;

-- name: GetActiveProvider :one
SELECT * FROM providers WHERE is_active = TRUE LIMIT 1;

-- name: CreateProvider :one
INSERT INTO providers (name, base_url, api_key, is_active)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateProviderMeta :one
UPDATE providers
SET name = $2, base_url = $3, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: UpdateProviderKey :exec
UPDATE providers SET api_key = $2, updated_at = NOW() WHERE id = $1;

-- name: SetProviderActive :exec
UPDATE providers SET is_active = (id = $1), updated_at = NOW();

-- name: DeleteProvider :exec
DELETE FROM providers WHERE id = $1;

-- name: CountProviders :one
SELECT COUNT(*) FROM providers;
