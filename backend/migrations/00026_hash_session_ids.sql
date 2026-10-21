-- +goose Up
-- Sessions are now looked up by the SHA-256 of the cookie's token, so a copy
-- of the database (or a backup) can't be used to sign in as anyone. Existing
-- sessions keep working: their stored token is replaced by its hash, which is
-- what the new code computes from the same cookie.
UPDATE sessions SET id = sha256(id);

-- +goose Down
-- Hashes can't be turned back into tokens: everyone signs in again.
DELETE FROM sessions;
