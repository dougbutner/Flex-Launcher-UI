-- Flex Launcher seed data.
-- Import after sql/schema.sql.
-- Refresh this file from a live database with: npm run db:export
-- Re-import keeps existing rows via ON DUPLICATE KEY UPDATE.
-- cache_entries and captcha are omitted: they expire on their own.

INSERT INTO site_settings (id, live, updated_at, updated_by)
VALUES (1, 1, 0, '')
ON DUPLICATE KEY UPDATE id = id;
