/** How many nights the events page asks for at a time. */
export const EVENT_FEED_PAGE_SIZE = 6;

/** Diary JSON is a short cache. Pages paint the bake, then read this. */
export function diaryCacheControl(_env) {
  return "public, max-age=60";
}

function todayIso(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function compareEvents(a, b) {
  return (
    String(a.date).localeCompare(String(b.date)) ||
    String(a.id).localeCompare(String(b.id)) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

/**
 * Upcoming nights, one card per date. `after` + `afterId` is the last night
 * already shown, so the next page continues without repeating it.
 */
export function pageEventFeed(
  events,
  { after = "", afterId = "", limit = EVENT_FEED_PAGE_SIZE, now = new Date() } = {},
) {
  const size = Math.min(24, Math.max(1, Math.floor(Number(limit) || EVENT_FEED_PAGE_SIZE)));
  const today = todayIso(now);
  const upcoming = (Array.isArray(events) ? events : [])
    .filter((event) => event?.date && event.date >= today)
    .slice()
    .sort(compareEvents);

  let start = 0;
  if (after) {
    const cursorId = String(afterId || "");
    start = upcoming.findIndex(
      (event) => event.date > after || (event.date === after && String(event.id) > cursorId),
    );
    if (start < 0) start = upcoming.length;
  }

  const page = upcoming.slice(start, start + size);
  const last = page[page.length - 1];
  const hasMore = start + page.length < upcoming.length;
  return {
    events: page,
    next: hasMore && last ? { after: last.date, afterId: String(last.id) } : null,
  };
}
