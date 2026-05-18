-- +goose Up
-- +goose StatementBegin
-- lookup_key: authenticate a raw key and return quota info.
-- Uses pgcrypto digest() so hashing happens inside Postgres, avoiding
-- bytea encoding issues when called from Supabase Edge Functions.
CREATE OR REPLACE FUNCTION lookup_key(p_raw_key TEXT)
RETURNS TABLE(key_id UUID, user_id UUID, daily_limit INT4, banned BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT k.id,
         k.user_id,
         COALESCE(u.daily_quota_override, k.daily_limit)::INT4,
         u.banned
  FROM ado_keys k
  JOIN users u ON u.id = k.user_id
  WHERE k.key_hash = digest(p_raw_key, 'sha256')
    AND k.revoked_at IS NULL;
END;
$$;

-- charge_quota: atomically increment daily usage.
-- Returns the new used count, or NULL if the quota is already met.
CREATE OR REPLACE FUNCTION charge_quota(p_key_id UUID, p_daily_limit INT4)
RETURNS INT4
LANGUAGE plpgsql AS $$
DECLARE
  v_used INT4;
BEGIN
  INSERT INTO daily_usage (key_id, day, used)
  VALUES (p_key_id, CURRENT_DATE, 1)
  ON CONFLICT (key_id, day) DO UPDATE
    SET used = daily_usage.used + 1
    WHERE daily_usage.used < p_daily_limit
  RETURNING used INTO v_used;

  RETURN v_used;
END;
$$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP FUNCTION IF EXISTS lookup_key(TEXT);
DROP FUNCTION IF EXISTS charge_quota(UUID, INT4);
-- +goose StatementEnd
