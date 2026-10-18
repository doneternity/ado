-- +goose Up
-- One row per API request made with an ADO key: what was asked for and how it
-- went, never the prompt or response content, and no IP address. Feeds usage
-- views, abuse tracing and (later) billing. Kept 90 days (see main.go).
CREATE TABLE request_log (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id            UUID REFERENCES ado_keys(id) ON DELETE SET NULL,
  endpoint          TEXT NOT NULL,     -- e.g. /chat/completions
  model             TEXT,
  status            INTEGER NOT NULL,
  duration_ms       INTEGER NOT NULL,
  stream            BOOLEAN NOT NULL DEFAULT false,
  provider          TEXT,              -- host of the provider that served it
  prompt_tokens     INTEGER,           -- when the provider reports usage
  completion_tokens INTEGER
);
CREATE INDEX request_log_created_at_idx ON request_log (created_at DESC);
CREATE INDEX request_log_user_created_idx ON request_log (user_id, created_at DESC);

-- Same protection as every other table (00019): no access via Supabase's Data API.
ALTER TABLE request_log ENABLE ROW LEVEL SECURITY;

-- +goose Down
DROP TABLE request_log;
