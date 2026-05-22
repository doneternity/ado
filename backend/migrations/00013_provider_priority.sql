-- +goose Up
-- +goose StatementBegin

-- failover order for the proxy: lower priority is tried first
ALTER TABLE providers ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE providers DROP COLUMN priority;
-- +goose StatementEnd
