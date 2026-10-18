-- name: ListProviderKeys :many
SELECT * FROM provider_keys ORDER BY provider_id, created_at;

-- name: ListActiveProviderKeys :many
-- The proxy chain: every active key of every active provider, in failover
-- order (provider priority, then the order keys were added).
SELECT k.id, k.provider_id, k.label, k.api_key, p.name, p.base_url
FROM provider_keys k
JOIN providers p ON p.id = k.provider_id
WHERE p.is_active AND k.is_active
ORDER BY p.priority ASC, p.created_at ASC, k.created_at ASC;

-- name: CreateProviderKey :one
INSERT INTO provider_keys (provider_id, label, api_key)
VALUES ($1, $2, $3)
RETURNING *;

-- name: SetProviderKeyActive :execrows
UPDATE provider_keys SET is_active = $3 WHERE id = $1 AND provider_id = $2;

-- name: DeleteProviderKey :execrows
DELETE FROM provider_keys WHERE id = $1 AND provider_id = $2;
