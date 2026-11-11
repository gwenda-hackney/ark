/**
 * A deal's or pop-up kitchen's "when" line, brought up to the visitor's day
 * (#240). The site is built ahead of time, so StandingCards puts the line it
 * will say over the card's next few nights on the card (standWhen), and the
 * page picks the one for today (whenOnDay, scripts/stand-cards.js): a pop-up
 * whose one night has passed goes; a deal on set weekdays keeps saying them.
 */
import { popupWhen } from "./popup-kitchen.js";
import { daysLabel, upcomingNights } from "./promotions.js";

/** The coming nights a card's line is worked out for. */
export const STAND_NIGHTS = 8;

/** The day after a day. */
function dayAfter(dateIso) {
  const [year, month, day] = String(dateIso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * What a card says over its coming nights: for each of the next few, the
 * line as it reads that day (the days, as the card puts them, and that
 * night's hours), from the day after the night before it (the first, from
 * its own day), kept only where it changes; and its last night, after which
 * the card goes.
 *
 * @param {"deal" | "popup"} kind
 * @param {object} row the series
 * @param {Array<object>} occurrences every night
 * @param {string} todayIso YYYY-MM-DD, the build's day
 * @param {(days: string, night: object) => string} line how the card puts
 *   the days and a night's hours together (StandingCards' whenLine)
 * @returns {{ timeline: Array<[string, string]>, last: string }} `timeline`:
 *   [from day, line] pairs
 */
export function standWhen(kind, row, occurrences, todayIso, line) {
  const ahead = upcomingNights(row?.seriesId, occurrences, todayIso);
  const every = upcomingNights(row?.seriesId, occurrences, "");
  const daysOn = (dayIso, night) =>
    kind === "popup"
      ? popupWhen(row, every, dayIso)
      : daysLabel(row?.recurrence || night.recurrence);
  const timeline = [];
  ahead.slice(0, STAND_NIGHTS).forEach((night, index, nights) => {
    const day = String(night.date);
    const from = index === 0 ? day : dayAfter(nights[index - 1].date);
    const text = line(daysOn(day, night), night);
    if (timeline.at(-1)?.[1] !== text) timeline.push([from, text]);
  });
  return {
    timeline,
    last: ahead.length ? String(ahead.at(-1).date) : "",
  };
}

/**
 * What a card says on a day: the line it was built with until its first
 * night (undefined: leave it), then the one in force that day; null once
 * its last night has passed, when the card goes.
 *
 * @param {Array<[string, string]>} timeline standWhen's
 * @param {string} last its last night
 * @param {string} todayIso
 * @returns {string | null | undefined}
 */
export function whenOnDay(timeline, last, todayIso) {
  if (!last || todayIso > last) return null;
  if (!timeline?.length || todayIso < timeline[0][0]) return undefined;
  let text = timeline[0][1];
  for (const [from, line] of timeline) if (from <= todayIso) text = line;
  return text;
}
