-- +goose Up
-- +goose StatementBegin

-- Replace pgcrypto digest() with decode(hex,'hex') so the function works
-- without the pgcrypto extension. The Edge Function now hashes the raw key
-- using the Web Crypto API and passes the hex digest here.
-- Must drop first because parameter name change is not allowed with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS lookup_key(TEXT);
CREATE FUNCTION lookup_key(p_key_hash_hex TEXT)
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
  WHERE k.key_hash = decode(p_key_hash_hex, 'hex')
    AND k.revoked_at IS NULL;
END;
$$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restore pgcrypto-based version.
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

-- +goose StatementEnd
