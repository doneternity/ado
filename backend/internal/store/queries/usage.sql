-- name: IncrementUsage :one
INSERT INTO daily_usage (key_id, day, used)
VALUES (sqlc.arg(key_id), CURRENT_DATE, 1)
ON CONFLICT (key_id, day) DO UPDATE
  SET used = daily_usage.used + 1
  WHERE daily_usage.used < sqlc.arg(daily_limit)
RETURNING used;
