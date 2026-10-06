-- Settings and machine state (#127), from Baserow Gwenda Config / Config.
-- One row per name + env + service (shared/config-model.js): the unique key
-- makes a write an upsert, so two writers can't both create the same row.
-- Ids are Baserow's row ids.
CREATE TABLE IF NOT EXISTS config_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  -- all | dev | production, or a site's name (preview) for machine state
  env TEXT NOT NULL DEFAULT 'all',
  -- all | ops | web
  service TEXT NOT NULL DEFAULT 'all',
  UNIQUE (name, env, service)
);

-- Retiring an Env deletes its rows; the unique key covers lookups by name.
CREATE INDEX IF NOT EXISTS config_values_env ON config_values (env);
