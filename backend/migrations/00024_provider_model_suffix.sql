-- +goose Up
-- Text to strip from the end of a provider's model IDs, so models a reseller
-- tags (e.g. "gpt-6-sol-thanks-somewhere") are listed and called by their
-- usual ID ("gpt-6-sol"). The proxy swaps the real ID back in when it
-- forwards, and out again in the response. Empty means IDs are used as is.
ALTER TABLE providers ADD COLUMN model_suffix TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE providers DROP COLUMN model_suffix;
