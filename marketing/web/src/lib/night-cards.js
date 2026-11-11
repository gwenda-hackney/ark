/**
 * Night cards (#240), on home and What's on: which nights show, and what
 * each day is called. The site is built ahead of time, so the page runs the
 * same rules again in the browser (scripts/night-cards.js) and yesterday's
 * night never leads.
 */
import { daysAway, weekStart } from "./london-day.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The day in pieces, for the date sticker: Tue, 10, Nov. */
export function nightDay(dateIso) {
  const [year, month, day] = String(dateIso).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    weekday: WEEKDAYS[date.getUTCDay()],
    day: date.getUTCDate(),
    month: MONTHS[date.getUTCMonth()],
  };
}

/**
 * What the day is called over the big night: Tonight, Tomorrow, else "Next
 * up". A night that runs over several days is tonight on each of them.
 *
 * @param {string} dateIso the night, or the first day of a run
 * @param {string} todayIso
 * @param {string} [endIso] the last day of a run
 */
export function nightLabel(dateIso, todayIso, endIso = dateIso) {
  const away = daysAway(dateIso, todayIso);
  if (away <= 0 && daysAway(endIso || dateIso, todayIso) >= 0) return "Tonight";
  if (away === 1) return "Tomorrow";
  return "Next up";
}

/**
 * Of the dates on the page, in order, which show: none that have passed,
 * and no more than fit. Returns their indexes; the first one leads. A night
 * that runs over several days has passed only after its last.
 *
 * @param {string[]} dates
 * @param {string} todayIso
 * @param {number} [shown] how many fit; all of them when left out
 * @param {Array<string | undefined>} [ends] each one's last day, when it
 *   runs past its date
 */
export function nightsToShow(dates, todayIso, shown = Infinity, ends = []) {
  return dates
    .map((date, index) => ({ date: ends[index] || date, index }))
    .filter(({ date }) => daysAway(date, todayIso) >= 0)
    .slice(0, shown)
    .map(({ index }) => index);
}

/** The narrowest and widest a flyer's own frame goes: 2:3 to square. */
const FLYER_SHAPES = { narrowest: 2 / 3, widest: 1 };

/**
 * The frame for a flyer shown whole: its own shape, read from the size in
 * its Sanity address (…-1080x1528.jpg), so it fills the frame with no strip
 * either side and nothing cropped. "" when the size isn't there, or the
 * image is too wide or too thin for a card: those keep the card's 4:5.
 *
 * @param {string} url
 * @returns {string} a CSS aspect-ratio, e.g. "1080 / 1528"
 */
export function flyerShape(url) {
  const size = /-(\d+)x(\d+)\.[a-z0-9]+(?:[?#]|$)/i.exec(String(url ?? ""));
  if (!size) return "";
  const [width, height] = [Number(size[1]), Number(size[2])];
  if (!width || !height) return "";
  const shape = width / height;
  if (shape < FLYER_SHAPES.narrowest || shape > FLYER_SHAPES.widest) return "";
  return `${width} / ${height}`;
}

/** A photo's frame, and a flyer's when its size can't be read: 4:5. */
const PHOTO_RATIO = 0.8;

/**
 * How wide a night's picture is for its height, as a number: a flyer shown
 * whole keeps its own shape (flyerShape), anything else is 4:5. Cards in a
 * row share a height and take their width from this, so no flyer is
 * cropped, none has a strip beside it, and the words under them line up.
 *
 * @param {string} url
 * @param {boolean} whole ops says show the whole image
 * @returns {number} width / height, e.g. 0.7068
 */
export function frameRatio(url, whole) {
  const shape = whole ? flyerShape(url) : "";
  if (!shape) return PHOTO_RATIO;
  const [width, height] = shape.split("/").map(Number);
  return Math.round((width / height) * 10000) / 10000;
}

/** A width in rem for an <img>'s `sizes`, rounded up so it never undershoots. */
function rem(value) {
  // (0.8 × 24 is 19.200000000000003: not a reason to round up.)
  return `${Math.ceil(Math.round(value * 10000) / 100) / 100}rem`;
}

/**
 * How wide the big night's picture is shown, for the browser to pick a size
 * by (an <img>'s `sizes`): 26rem beside its words, 20rem on a tablet, the
 * screen less its gutters on a phone (styles/chart-nights.css).
 */
export const LEAD_NIGHT_SIZES =
  "(min-width: 64.0625rem) 26rem, (min-width: 40.0625rem) 20rem, calc(100vw - 2.5rem)";

/**
 * And a night's in the rows after it: as wide as its shape makes it at the
 * tallest a row gets (24rem, 21rem on a tablet); on a phone, the 5rem
 * thumbnail beside its words.
 *
 * @param {number} shape width / height (frameRatio)
 */
export function nightSizes(shape) {
  return `(min-width: 64.0625rem) ${rem(shape * 24)}, (min-width: 40.0625rem) ${rem(shape * 21)}, 5rem`;
}

/**
 * A deal's or the pop-up kitchen's picture: as wide as its shape makes it at
 * the card's height (15rem; 18.75rem for a card alone on a wide screen); on
 * a phone, the 7.5rem column beside its words.
 *
 * @param {number} shape width / height (frameRatio)
 * @param {boolean} alone the only card in its section
 */
export function standSizes(shape, alone) {
  return `(min-width: 64.0625rem) ${rem(shape * (alone ? 18.75 : 15))}, (min-width: 40.0625rem) ${rem(shape * 15)}, 7.5rem`;
}

/**
 * What a week is called: "This week", "Next week", then "Week of 23 Nov".
 *
 * @param {string} weekStartIso the week's Monday
 * @param {string} todayIso
 */
export function weekLabel(weekStartIso, todayIso) {
  const weeks = Math.round(daysAway(weekStartIso, weekStart(todayIso)) / 7);
  // A run that began last week and is still going
  if (weeks < 0) return "On now";
  if (weeks === 0) return "This week";
  if (weeks === 1) return "Next week";
  const { day, month } = nightDay(weekStartIso);
  return `Week of ${day} ${month}`;
}

/**
 * The nights to come, by week (Monday to Sunday), in order: each week with
 * its Monday, what it's called, and the indexes of its nights. Nights that
 * have passed are left out, and so is a week with none left in it.
 *
 * A night that runs over several days is in the week of its first.
 *
 * @param {string[]} dates the nights on the page, in date order
 * @param {string} todayIso
 * @param {Array<string | undefined>} [ends] each one's last day (nightsToShow)
 * @returns {Array<{ start: string, label: string, indexes: number[] }>}
 */
export function nightWeeks(dates, todayIso, ends = []) {
  const weeks = new Map();
  for (const index of nightsToShow(dates, todayIso, Infinity, ends)) {
    const start = weekStart(dates[index]);
    if (!weeks.has(start)) {
      weeks.set(start, {
        start,
        label: weekLabel(start, todayIso),
        indexes: [],
      });
    }
    weeks.get(start).indexes.push(index);
  }
  return [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Nights that are one event over several days, put together: the nights of
 * a series that doesn't repeat (ops: hand-added dates, no "every Thursday"),
 * on days in a row, are one run, and get one card. A weekly night is never
 * joined to another, and nor are a series' nights with a day between them.
 *
 * @param {Array<{ date: string, seriesId?: string }>} nights in date order
 * @param {Array<{ seriesId: string, schedule?: string, recurrence?: string }>} series
 * @returns {Array<{ start: string, end: string, indexes: number[] }>} the
 *   runs in the order they start; a night on its own is a run of one
 */
export function nightRuns(nights, series) {
  const joins = new Set(
    (series || [])
      .filter(
        (row) =>
          row.schedule !== "repeating" && !String(row.recurrence || "").trim(),
      )
      .map((row) => row.seriesId),
  );
  const runs = [];
  /** The run each series is in the middle of. */
  const open = new Map();
  (nights || []).forEach((night, index) => {
    const run = night.seriesId ? open.get(night.seriesId) : undefined;
    if (run && daysAway(night.date, run.end) === 1) {
      run.end = night.date;
      run.indexes.push(index);
      return;
    }
    const next = { start: night.date, end: night.date, indexes: [index] };
    runs.push(next);
    if (night.seriesId && joins.has(night.seriesId)) {
      open.set(night.seriesId, next);
    }
  });
  return runs;
}

/**
 * A run's days for the date sticker, in the same three lines as one day's:
 * Sat–Sun, 21–22, Nov; over a month end, Mon–Tue, 30–1, Nov–Dec.
 *
 * @param {string} startIso
 * @param {string} [endIso]
 * @returns {{ weekday: string, day: string, month: string }}
 */
export function runDay(startIso, endIso = startIso) {
  const first = nightDay(startIso);
  const last = nightDay(endIso || startIso);
  if (!endIso || endIso === startIso) {
    return { ...first, day: String(first.day) };
  }
  return {
    weekday: `${first.weekday}–${last.weekday}`,
    day: `${first.day}–${last.day}`,
    month:
      first.month === last.month ? first.month : `${first.month}–${last.month}`,
  };
}

/**
 * A run's hours: once when every day keeps the same, else day by day
 * ("Sat 12–8pm", "Sun 1–6pm"). A day with no hours is left out.
 *
 * @param {Array<{ date: string, span: string }>} days
 * @returns {string[]}
 */
export function runTimes(days) {
  const timed = (days || []).filter((day) => day.span);
  if (!timed.length) return [];
  if (
    timed.length === (days || []).length &&
    timed.every((day) => day.span === timed[0].span)
  ) {
    return [timed[0].span];
  }
  if ((days || []).length === 1) return [timed[0].span];
  return timed.map((day) => `${nightDay(day.date).weekday} ${day.span}`);
}
