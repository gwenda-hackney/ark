-- Which deploy migrations (migrations/*.mjs) have run in this environment, so
-- each runs once (scripts/lib/migration-record.mjs). Standing ones
-- (`export const every = true`) run on every deploy and aren't recorded.
-- Config is never copied from production, so this record stays this
-- environment's; the production → dev copy replaces dev's with production's.
CREATE TABLE IF NOT EXISTS data_migrations (
  name TEXT PRIMARY KEY,
  app TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT '',
  ran_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Every one-off here today has run in both environments (release
-- 2026.11.20 carried them all to production).
INSERT OR IGNORE INTO data_migrations (name, app, phase) VALUES
  ('2026-10-02-config-dev-rows.mjs', 'ops', 'post'),
  ('2026-10-05-play-form-series-choice.mjs', 'web', 'post'),
  ('2026-10-20-description-entities.mjs', 'ops', 'post'),
  ('2026-11-10-a-series-categories.mjs', 'ops', 'post'),
  ('2026-11-10-chez-pickle-menu.mjs', 'ops', 'post'),
  ('2026-11-10-menu-plain-sections.mjs', 'ops', 'post'),
  ('2026-11-10-offer-pounds.mjs', 'ops', 'post'),
  ('2026-11-10-one-happy-hour.mjs', 'ops', 'post'),
  ('2026-11-10-z-promotions-on-website.mjs', 'ops', 'post'),
  ('2026-11-11-chez-pickle-thursdays.mjs', 'ops', 'post'),
  ('2026-11-11-flyers-out-of-galleries.mjs', 'ops', 'post'),
  ('2026-11-11-menu-beer-names.mjs', 'ops', 'post'),
  ('2026-11-11-opening-hours.mjs', 'ops', 'post'),
  ('2026-11-11-party-form.mjs', 'web', 'post'),
  ('2026-11-11-venue-gallery.mjs', 'ops', 'post'),
  ('2026-11-12-menus.mjs', 'ops', 'post'),
  ('2026-11-12-popup-logo.mjs', 'ops', 'post'),
  ('2026-11-17-chez-pickle-colour.mjs', 'ops', 'post'),
  ('2026-11-17-chez-pickle-wed-sun.mjs', 'ops', 'post'),
  ('2026-11-19-pinsa-a-roma.mjs', 'ops', 'post'),
  ('2026-11-20-pinsa-a-roma-email.mjs', 'ops', 'post'),
  ('2026-11-21-pinsa-a-roma-email-livelier.mjs', 'ops', 'post'),
  ('2026-11-22-pinsa-a-roma-email-teaming-up.mjs', 'ops', 'post');
