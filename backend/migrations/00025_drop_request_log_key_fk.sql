-- +goose Up
-- request_log.key_id pointed at ado_keys with ON DELETE SET NULL but had no
-- index, so deleting a key (every account deletion, including the inactive
-- cleanup of up to 10,000 at once) scanned the whole log once per key. Keys
-- are only ever deleted together with their user, whose request_log rows are
-- deleted with them (user_id, indexed), so the constraint protected nothing.
-- The column stays, for tracing which key made a request.
ALTER TABLE request_log DROP CONSTRAINT IF EXISTS request_log_key_id_fkey;

-- +goose Down
ALTER TABLE request_log
  ADD CONSTRAINT request_log_key_id_fkey FOREIGN KEY (key_id) REFERENCES ado_keys(id) ON DELETE SET NULL;
