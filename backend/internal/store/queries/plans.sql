-- name: ListPlansWithUserCounts :many
SELECT p.id, p.name, p.daily_quota, p.rpm, p.created_at,
       COUNT(u.id)::int4 AS user_count
FROM plans p
LEFT JOIN users u ON u.plan_id = p.id
GROUP BY p.id
ORDER BY p.created_at ASC;

-- name: UpsertPlan :one
INSERT INTO plans (id, name, daily_quota, rpm)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, daily_quota = EXCLUDED.daily_quota, rpm = EXCLUDED.rpm
RETURNING *;

-- name: DeleteUnusedPlan :execrows
DELETE FROM plans p
WHERE p.id = $1
  AND p.id <> 'free'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.plan_id = p.id);

-- name: SetUserPlan :execrows
UPDATE users SET plan_id = $2, updated_at = NOW() WHERE id = $1;
