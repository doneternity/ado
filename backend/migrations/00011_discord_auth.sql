-- +goose Up
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN discord_id TEXT UNIQUE;

ALTER TABLE users DROP CONSTRAINT users_has_credential;
ALTER TABLE users ADD CONSTRAINT users_has_credential
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL OR discord_id IS NOT NULL);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP CONSTRAINT users_has_credential;
ALTER TABLE users ADD CONSTRAINT users_has_credential
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);

ALTER TABLE users DROP COLUMN discord_id;
-- +goose StatementEnd
