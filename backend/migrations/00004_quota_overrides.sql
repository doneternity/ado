-- +goose Up
ALTER TABLE users ADD COLUMN daily_quota_override INT;

-- +goose Down
ALTER TABLE users DROP COLUMN daily_quota_override;
