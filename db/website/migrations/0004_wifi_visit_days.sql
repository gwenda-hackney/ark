-- How many days a guest has got online through the Wi-Fi: one more each new
-- day they sign in (shared/guests subscribers.js). Before this only the last
-- day was kept, so anyone seen counts one.
ALTER TABLE subscribers ADD COLUMN visit_days INTEGER NOT NULL DEFAULT 0;
UPDATE subscribers SET visit_days = 1 WHERE last_seen_on IS NOT NULL;
