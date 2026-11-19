-- A one-off email's name (#348): what ops calls it on its card and in the
-- editor ("Pinsa A Roma promo"), apart from the subject the list sees. The
-- emails there already are named after their subject.
ALTER TABLE emails ADD COLUMN name TEXT NOT NULL DEFAULT '';
UPDATE emails SET name = substr(subject, 1, 80) WHERE name = '';
