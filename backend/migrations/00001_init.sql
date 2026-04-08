-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash   TEXT,
  google_sub      TEXT UNIQUE,
  display_name    TEXT,
  photo_url       TEXT,
  banned          BOOLEAN NOT NULL DEFAULT FALSE,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_has_credential CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
);

CREATE TABLE sessions (
  id            BYTEA PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token    BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  user_agent    TEXT,
  ip            INET
);
CREATE INDEX sessions_user_id_idx    ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE email_verification_tokens (
  token_hash    BYTEA PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ
);
CREATE INDEX evt_user_id_idx ON email_verification_tokens(user_id);

CREATE TABLE ado_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_prefix    TEXT NOT NULL,
  key_hash      BYTEA NOT NULL UNIQUE,
  daily_limit   INTEGER NOT NULL DEFAULT 50,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX ado_keys_one_active_per_user
  ON ado_keys(user_id) WHERE revoked_at IS NULL;

CREATE TABLE daily_usage (
  key_id   UUID NOT NULL REFERENCES ado_keys(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  used     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS daily_usage;
DROP TABLE IF EXISTS ado_keys;
DROP TABLE IF EXISTS email_verification_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS pgcrypto;
-- +goose StatementEnd
