-- +goose Up
ALTER TABLE ado_keys ADD COLUMN reasoning_mode BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE ado_keys DROP COLUMN reasoning_mode;
