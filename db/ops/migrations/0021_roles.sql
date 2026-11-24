-- Access by area (#375): roles, each with a level (none, view, edit) for
-- every area of ops (ops/site/src/access/areas.js), and each user's role
-- plus any areas given to them alone.
--
-- Owner has everything and can't be emptied. Manager is what everyone on
-- the users list could do before roles: all but sending to the mailing
-- list, guests' addresses (People) and developer tools. Marketing has all of
-- What's on (nights, pop-ups, deals, occasions, artists, email and sending
-- it, photos) and the website, and can look at the rest. A user with no role
-- counts as the default role, Manager. Today's admins (config
-- ops.admin_emails) become Owners in migrations/2026-11-24-owners-from-admins.mjs.
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE,
  owner INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  -- {"<area id>": "none" | "view" | "edit"}; an area left out is none.
  areas TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_name ON roles (name);

INSERT OR IGNORE INTO roles (id, name, owner, is_default, areas) VALUES
  (1, 'Owner', 1, 0, '{}'),
  (2, 'Manager', 0, 1, '{"email-people":"none","email-send":"none","email":"edit","whats-on":"edit","occasions":"edit","artists":"edit","photos":"edit","menus":"edit","stock":"edit","lightspeed":"edit","venue":"edit","website":"edit","config":"edit","users":"edit","devtools":"none"}'),
  (3, 'Marketing', 0, 0, '{"whats-on":"edit","occasions":"edit","artists":"edit","email":"edit","email-send":"edit","photos":"edit","website":"edit"}');

ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles (id);
-- {"<area id>": "view" | "edit"}: raises their role on single areas.
ALTER TABLE users ADD COLUMN extras TEXT NOT NULL DEFAULT '{}';
