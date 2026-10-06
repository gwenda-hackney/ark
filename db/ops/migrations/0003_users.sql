-- Who may sign in to ops (#127): Baserow's "Users" table. Ids are Baserow's
-- row ids. Emails are stored lower case; NOCASE keeps comparisons
-- case-insensitive whatever writes them. Sign-in looks users up by email.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email);
