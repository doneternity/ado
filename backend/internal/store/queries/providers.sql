-- name: ListProviders :many
SELECT * FROM providers ORDER BY created_at ASC;

-- name: GetProvider :one
SELECT * FROM providers WHERE id = $1;

-- name: CreateProvider :one
-- Keys live in provider_keys; providers.api_key is legacy and left empty.
INSERT INTO providers (name, base_url, is_active, priority, model_suffix)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateProviderMeta :one
UPDATE providers
SET name = $2, base_url = $3, priority = $4, model_suffix = $5, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: SetProviderModels :execrows
UPDATE providers SET model_mode = $2, model_ids = $3, updated_at = NOW() WHERE id = $1;

-- name: SetProviderActiveState :exec
UPDATE providers SET is_active = $2, updated_at = NOW() WHERE id = $1;

-- name: DeleteProvider :exec
DELETE FROM providers WHERE id = $1;

-- name: CountProviders :one
SELECT COUNT(*) FROM providers;

-- name: CountActiveProviders :one
SELECT COUNT(*) FROM providers WHERE is_active = TRUE;
