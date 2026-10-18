-- +goose Up
-- Plans group users under shared limits. NULL limits fall back to the global
-- settings (global_daily_quota / global_rpm_limit), so the seeded free plan
-- behaves exactly like before this migration.
CREATE TABLE plans (
  id          TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,32}$'),
  name        TEXT NOT NULL,
  daily_quota INTEGER CHECK (daily_quota > 0),
  rpm         INTEGER CHECK (rpm > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name) VALUES ('free', 'Free');

ALTER TABLE users
  ADD COLUMN plan_id TEXT NOT NULL DEFAULT 'free'
  REFERENCES plans(id) ON UPDATE CASCADE;

CREATE INDEX users_plan_id_idx ON users (plan_id);

-- +goose Down
ALTER TABLE users DROP COLUMN plan_id;
DROP TABLE plans;
