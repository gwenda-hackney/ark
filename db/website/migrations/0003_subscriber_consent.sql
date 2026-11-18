-- Marketing consent on subscribers. Everyone who gets online through the
-- guest Wi-Fi is kept here, but only those who ticked the newsletter box (or
-- signed up on the website) are on the mailing list: `marketing` = 1. The
-- Mailchimp sync sends marketing rows only.
--
-- Additive, so code still running keeps working: rows it inserts get
-- marketing = 1, which is right for a website sign-up.

-- Existing rows stay on the list, as today.
ALTER TABLE subscribers ADD COLUMN marketing INTEGER NOT NULL DEFAULT 1;
-- The day they last said yes; NULL without consent.
ALTER TABLE subscribers ADD COLUMN marketing_on TEXT;
-- The day they unsubscribed (in Mailchimp; the sync brings it back); NULL otherwise.
ALTER TABLE subscribers ADD COLUMN marketing_off_on TEXT;
-- The last day they got online through the guest Wi-Fi; NULL if never.
ALTER TABLE subscribers ADD COLUMN last_seen_on TEXT;
-- signed_up_on stays "first seen".

UPDATE subscribers SET marketing_on = signed_up_on WHERE marketing = 1 AND marketing_on IS NULL;

-- The Mailchimp sync's hourly query now also asks for marketing.
DROP INDEX IF EXISTS subscribers_synced;
CREATE INDEX IF NOT EXISTS subscribers_to_sync ON subscribers (synced, marketing, id);
