-- +goose Up
-- +goose StatementBegin

-- unused helpers from the retired supabase edge function
DROP FUNCTION IF EXISTS lookup_key(TEXT);
DROP FUNCTION IF EXISTS charge_quota(UUID, INT4);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
