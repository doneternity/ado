-- +goose Up
-- +goose StatementBegin

-- A provider can hold several API keys. The proxy spreads requests across a
-- provider's active keys and fails over between them (see RebuildChain).
CREATE TABLE provider_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT '',
  api_key     TEXT NOT NULL, -- AES-256-GCM encrypted (internal/keyencrypt)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX provider_keys_provider_idx ON provider_keys (provider_id, created_at);
-- Supabase's Data API must not expose this table (TestRLS_EnabledOnEveryTable).
ALTER TABLE provider_keys ENABLE ROW LEVEL SECURITY;

-- Every existing provider keeps its key.
INSERT INTO provider_keys (provider_id, api_key, created_at)
SELECT id, api_key, created_at FROM providers WHERE api_key <> '';

-- providers.api_key is no longer read or written. It stays (empty for new
-- providers) so the previous release still starts if a deploy is rolled back;
-- drop it in a later migration.
ALTER TABLE providers ALTER COLUMN api_key SET DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Give each provider its oldest key back before dropping the table.
UPDATE providers p SET api_key = k.api_key
FROM (
  SELECT DISTINCT ON (provider_id) provider_id, api_key
  FROM provider_keys ORDER BY provider_id, created_at
) k
WHERE k.provider_id = p.id AND p.api_key = '';
ALTER TABLE providers ALTER COLUMN api_key DROP DEFAULT;
DROP TABLE provider_keys;

-- +goose StatementEnd
