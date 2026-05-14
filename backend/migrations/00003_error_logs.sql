-- +goose Up
CREATE TABLE error_logs (
  id         BIGSERIAL PRIMARY KEY,
  level      TEXT NOT NULL CHECK (level IN ('error', 'warn')),
  message    TEXT NOT NULL,
  context    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX error_logs_created_at_idx ON error_logs (created_at DESC);

-- +goose Down
DROP TABLE error_logs;
