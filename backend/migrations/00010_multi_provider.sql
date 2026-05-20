-- +goose Up
-- +goose StatementBegin

-- Allow multiple providers to be active at once. The proxy tries each active
-- provider in turn (failover routing), so the single-active constraint that
-- migration 00007 added is no longer needed.
DROP INDEX IF EXISTS providers_one_active;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restoring the single-active index requires at most one active provider, so
-- deactivate all but the oldest active one first.
UPDATE providers SET is_active = FALSE
WHERE id <> (
  SELECT id FROM providers WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS providers_one_active
  ON providers(is_active) WHERE is_active = TRUE;

-- +goose StatementEnd
