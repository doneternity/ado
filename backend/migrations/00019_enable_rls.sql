-- +goose Up
-- Supabase exposes the public schema through its Data API (PostgREST) to the
-- anon and authenticated roles. With row-level security off, anyone holding the
-- project's anon key could read or write these tables directly. Enabling RLS
-- with no policies denies those roles everything. The backend connects as the
-- table owner, which bypasses RLS, so the app itself is unaffected.
-- +goose StatementBegin
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
-- +goose StatementEnd
