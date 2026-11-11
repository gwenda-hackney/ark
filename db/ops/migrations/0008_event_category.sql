-- What a series is: 'event' (a night or run of nights, everything so far),
-- 'promotion' (a standing deal such as Happy Hour) or 'popup' (a pop-up
-- kitchen). EVENT_CATEGORIES in ops/site/src/events/server/event-model.js.
-- A night has none of its own: it takes its series'.

ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'event';

-- The pop-up kitchen a chapter of the menu belongs to: the id of an event
-- series whose category is 'popup'. Only a chapter carries one; a group
-- follows its chapter. No foreign key: the menu and events are copied
-- separately (data-move), and the menu checks the series through the events'
-- own interface.
ALTER TABLE menu_sections ADD COLUMN popup_series_id INTEGER;
