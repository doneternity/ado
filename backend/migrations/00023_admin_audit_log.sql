-- +goose Up
-- Who changed what in the admin area: providers and their keys, users, plans,
-- quotas, maintenance and the announcement. One row per successful change.
-- Never holds secrets: request bodies aren't stored, only what the handler
-- notes (names, emails, new values). Kept a year (see main.go).
CREATE TABLE admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,              -- email at the time, kept if the account goes
  action      TEXT NOT NULL,              -- method and route, e.g. "PUT /providers/{id}"
  target      TEXT NOT NULL DEFAULT '',   -- readable: a provider name, a user's email
  details     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);

-- Same protection as every other table (00019): no access via Supabase's Data API.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- +goose Down
DROP TABLE admin_audit_log;
