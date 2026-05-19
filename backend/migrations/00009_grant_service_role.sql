-- +goose Up
-- +goose StatementBegin

-- The Supabase edge function reads providers directly via PostgREST using
-- the service_role key. Tables created by migrations don't automatically
-- get grants to Supabase roles, so we grant them explicitly here.
GRANT SELECT ON providers TO service_role;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
REVOKE SELECT ON providers FROM service_role;
-- +goose StatementEnd
