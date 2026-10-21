-- +goose Up
-- Which of a provider's models ADO offers (Admin → Providers → Models).
-- model_mode 'all': every model except those in model_ids (new models the
-- provider adds show up); 'only': just those in model_ids (new ones stay
-- hidden until picked). IDs are as ADO lists them, after model_suffix.
ALTER TABLE providers
  ADD COLUMN model_mode TEXT NOT NULL DEFAULT 'all' CHECK (model_mode IN ('all', 'only')),
  ADD COLUMN model_ids TEXT[] NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE providers DROP COLUMN model_mode, DROP COLUMN model_ids;
