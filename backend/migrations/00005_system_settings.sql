-- +goose Up
CREATE TABLE system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO system_settings (key, value) VALUES
  ('maintenance_mode', 'false'),
  ('global_daily_quota', '50');

-- +goose Down
DROP TABLE system_settings;
