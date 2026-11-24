-- Two roles for now (#375): Owner, and Marketing, which is now everyone's
-- until they're given another. Manager, and any other role, go; their
-- people get the default (Marketing). What someone can do is their role's
-- alone: the areas given to single people above their role are cleared
-- (the extras column stays, unread, as SQLite columns do).
UPDATE users SET role_id = NULL WHERE role_id IS NOT NULL AND role_id NOT IN (1, 3);
UPDATE roles SET is_default = CASE WHEN id = 3 THEN 1 ELSE 0 END;
DELETE FROM roles WHERE id NOT IN (1, 3);
UPDATE users SET extras = '{}';
