-- Wi-Fi guests: every address that got online through the guest Wi-Fi
-- portal, for Wi-Fi and service messages only. Not the newsletter list: a
-- guest is on `subscribers` only when they ticked the box. Not synced anywhere.

-- One row per address: coming back only moves last_seen_on.
CREATE TABLE IF NOT EXISTS wifi_guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  first_seen_on TEXT NOT NULL,
  last_seen_on TEXT NOT NULL
);
