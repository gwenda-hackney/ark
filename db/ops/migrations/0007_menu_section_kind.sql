-- Whether a chapter of the menu is drinks or food: 'bar' or 'kitchen'. The
-- website shows a kitchen chapter on /kitchen and the rest on /bar. Only a
-- chapter (no parent) carries one; a group follows its chapter, so its own
-- is ''. Every chapter so far is drinks.

ALTER TABLE menu_sections ADD COLUMN kind TEXT NOT NULL DEFAULT 'bar';
UPDATE menu_sections SET kind = '' WHERE parent_id IS NOT NULL;
