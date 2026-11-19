/**
 * What's on by date (#352): each day with what's on that day, the night's
 * event first and big, then the deals and pop-up kitchens running that day.
 * What's on used to list deals and pop-ups once each, above the nights;
 * a visitor now sees tonight in one place.
 *
 * An event over several days in a row (nightRuns) is one card, on its first
 * day, and keeps its day on the page until its last. Deals and pop-ups
 * repeat on every day they run, so they're listed for the next few weeks
 * only (`standWeeks`); the events go as far as the diary does.
 */
import { daysAway, weekStart } from "./london-day.js";
import { nightRuns } from "./night-cards.js";
import { withSeriesCategory } from "./promotions.js";

/** How far ahead deals and pop-ups are listed, day by day. */
export const STAND_WEEKS = 4;

/**
 * @param {object} catalog
 * @param {Array<object>} catalog.occurrences every night, in date order
 * @param {Array<object>} catalog.series the catalog's series
 * @param {string} catalog.today YYYY-MM-DD, London
 * @param {Set<string>} [catalog.stands] the deal and pop-up series that are
 *   on (the ones with a card); every promotion and pop-up when left out
 * @param {number} [catalog.standWeeks]
 * @returns {Array<{
 *   date: string,
 *   end: string,
 *   week: string,
 *   events: Array<{ start: string, end: string, nights: object[] }>,
 *   stands: Array<{ kind: "deal" | "popup", night: object }>,
 * }>} the days with anything on, in date order. `end` is the last day the
 *   day stays on the page: its own, or the last of an event that starts on it.
 */
export function whatsOnDays({
  occurrences,
  series,
  today,
  stands,
  standWeeks = STAND_WEEKS,
}) {
  const nights = withSeriesCategory(occurrences, series).filter(
    (night) => night?.date && night.title,
  );
  const days = new Map();
  const dayOf = (date) => {
    if (!days.has(date)) {
      days.set(date, {
        date,
        end: date,
        week: weekStart(date),
        events: [],
        stands: [],
      });
    }
    return days.get(date);
  };

  const events = nights.filter((night) => night.category === "event");
  for (const run of nightRuns(events, series)) {
    if (run.end < today) continue;
    const day = dayOf(run.start);
    day.events.push({
      start: run.start,
      end: run.end,
      nights: run.indexes.map((index) => events[index]),
    });
    if (run.end > day.end) day.end = run.end;
  }

  for (const night of nights) {
    if (night.category === "event") continue;
    if (night.date < today) continue;
    if (daysAway(night.date, today) >= standWeeks * 7) continue;
    if (stands && !stands.has(night.seriesId)) continue;
    const kind = night.category === "promotion" ? "deal" : "popup";
    const day = dayOf(night.date);
    // One card a series a day, should ops have two nights on one day.
    if (day.stands.some((stand) => stand.night.seriesId === night.seriesId))
      continue;
    day.stands.push({ kind, night });
  }

  for (const day of days.values()) {
    // Deals before pop-ups, then by name, so a day reads the same each week.
    day.stands.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "deal" ? -1 : 1) ||
        String(a.night.seriesTitle || a.night.title).localeCompare(
          String(b.night.seriesTitle || b.night.title),
        ),
    );
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** True when the day is still on the page: today is not past its `end`. */
export function dayIsOn(day, todayIso) {
  return String(day.end || day.date) >= todayIso;
}

/**
 * Coming up later (home): one of each thing on later that isn't in the days
 * shown above it (an event, a deal, a pop-up kitchen), at its next night, so
 * a new pop-up or a one-off is teased before its week comes round.
 *
 * @param {object} catalog
 * @param {Array<object>} catalog.occurrences every night, in date order
 * @param {Array<object>} catalog.series the catalog's series
 * @param {string} catalog.today YYYY-MM-DD, London
 * @param {Set<string>} catalog.shown the series already in the days shown
 * @param {string} [catalog.after] only what's next on after this day (the
 *   last day shown); anything to come when left out
 * @param {number} [catalog.limit]
 * @returns {Array<{ kind: "event" | "deal" | "popup", night: object }>} in
 *   the order they're next on
 */
export function comingUpLater({
  occurrences,
  series,
  today,
  shown,
  after = "",
  limit = 6,
}) {
  const next = new Map();
  for (const night of withSeriesCategory(occurrences, series)) {
    if (!night?.date || !night.title || night.date < today) continue;
    const key = night.seriesId || night.slug || night.title;
    if (shown.has(key)) continue;
    const seen = next.get(key);
    if (!seen || night.date < seen.date) next.set(key, night);
  }
  return [...next.values()]
    .filter((night) => night.date > after)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((night) => ({
      kind:
        night.category === "promotion"
          ? "deal"
          : night.category === "popup"
            ? "popup"
            : "event",
      night,
    }));
}
