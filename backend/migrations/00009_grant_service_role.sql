-- +goose Up
-- +goose StatementBegin

-- The Supabase edge function reads providers directly via PostgREST using
-- the service_role key. Tables created by migrations don't automatically
-- get grants to Supabase roles, so we grant them explicitly here.
-- Skips gracefully on plain Postgres (e.g. local dev / CI) where service_role doesn't exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON providers TO service_role;
  END IF;
END;
$$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE SELECT ON providers FROM service_role;
  END IF;
END;
$$;
-- +goose StatementEnd
