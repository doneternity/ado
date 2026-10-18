-- +goose Up
-- +goose StatementBegin

-- When the user last signed in. Sessions are deleted after they expire, so
-- without this a user who only used the dashboard (never the API) would look
-- inactive once their last session was gone. Used by the inactive-account
-- cleanup in Admin > Users.
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

UPDATE users u SET last_login_at = s.last_seen
FROM (SELECT user_id, MAX(last_seen_at) AS last_seen FROM sessions GROUP BY user_id) s
WHERE s.user_id = u.id;

-- +goose StatementEnd

-- +goose Down
ALTER TABLE users DROP COLUMN last_login_at;
