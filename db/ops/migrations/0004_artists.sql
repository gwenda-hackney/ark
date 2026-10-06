-- Wall artists and guest artists (#127): Baserow's "Artists" and "Guest
-- artists" tables. Ids are Baserow's row ids.
--
-- artists: slot is current, next or previous (one current and one next at a
-- time, kept by ops). Months are "1"-"12" or ''. Photos are Sanity asset ids
-- (#183): portrait_asset, and art_assets / gwenda_assets as JSON lists of
-- { asset, label }. D1 holds no files.
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  slot TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '',
  start_month TEXT NOT NULL DEFAULT '',
  end_month TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  portrait_asset TEXT NOT NULL DEFAULT '',
  art_assets TEXT NOT NULL DEFAULT '[]',
  gwenda_assets TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS artists_slot ON artists (slot);

-- guest_artists: ops' own record of a play applicant, one per email (stored
-- lower case; NOCASE keeps lookups case-insensitive). decision is Approved,
-- Declined or ''.
CREATE TABLE IF NOT EXISTS guest_artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  decision TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '',
  artist_link TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_artists_email ON guest_artists (email);
