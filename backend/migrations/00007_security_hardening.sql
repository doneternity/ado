-- +goose Up
-- +goose StatementBegin

-- Fix SECURITY DEFINER functions to pin the search_path, preventing
-- schema injection attacks in shared Postgres environments (e.g. Supabase).
CREATE OR REPLACE FUNCTION lookup_key(p_raw_key TEXT)
RETURNS TABLE(key_id UUID, user_id UUID, daily_limit INT4, banned BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION charge_quota(p_key_id UUID, p_daily_limit INT4)
RETURNS INT4
LANGUAGE plpgsql
SET search_path = public
AS $$
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

-- Enforce at DB level that only one provider can be active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS providers_one_active
  ON providers(is_active)
  WHERE is_active = TRUE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS providers_one_active;
-- Functions are restored to their 00006 versions (without search_path).
-- +goose StatementEnd
