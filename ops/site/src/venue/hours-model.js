/**
 * Opening hours (#240), part of the venue's details: the week, the one
 * place it is kept. Staff edit it in ops (VenuePage.svelte); saving puts it
 * on the website (server/venue-website.js). Plain objects and rules, no
 * I/O: the page and the server both use it.
 *
 * A day is closed, or open from `opens` to `closes`, London wall-clock
 * "HH:MM". A close earlier than the opening is after midnight, in the small
 * hours of the next day (Saturday 4pm–1am); it must be before SMALL_HOURS_END,
 * so a slip (open 5pm, close 4pm) isn't read as a 23-hour night.
 */

/** @typedef {"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"} DayKey */
/** @typedef {{ day: DayKey, closed: boolean, opens: string, closes: string }} OpeningDay */

/** @type {DayKey[]} Monday first: weeks at the bar run Monday to Sunday. */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** @type {Record<DayKey, string>} */
export const DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** A close before this, and before the opening, is after midnight. */
export const SMALL_HOURS_END = "06:00";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTime(value) {
  return TIME.test(String(value ?? ""));
}

function minutesOf(hhmm) {
  const [, hours, minutes] = TIME.exec(hhmm) || [];
  return Number(hours) * 60 + Number(minutes);
}

/**
 * One day, cleaned: a closed day keeps no times.
 * @returns {OpeningDay}
 */
export function openingDay(fields = {}) {
  const day = /** @type {DayKey} */ (String(fields.day || "").trim().toLowerCase());
  const closed = fields.closed === true || fields.closed === 1 || fields.closed === "true";
  return {
    day,
    closed,
    opens: closed ? "" : String(fields.opens ?? "").trim(),
    closes: closed ? "" : String(fields.closes ?? "").trim(),
  };
}

/** True when the day closes after midnight (its close is earlier than its opening). */
export function closesAfterMidnight(day) {
  return !day.closed && isTime(day.opens) && isTime(day.closes) && minutesOf(day.closes) < minutesOf(day.opens);
}

/** What's wrong with a day, in words; "" when it's fine. */
export function dayProblem(day) {
  if (!DAYS.includes(day?.day)) return "Not a day of the week.";
  if (day.closed) return "";
  if (!day.opens || !day.closes) return "Add both times, or mark the day closed.";
  if (!isTime(day.opens) || !isTime(day.closes)) return "Use a time like 5pm or 17:00.";
  const opens = minutesOf(day.opens);
  const closes = minutesOf(day.closes);
  if (opens === closes) return "It closes when it opens. Change one of the times.";
  if (closes < opens && closes >= minutesOf(SMALL_HOURS_END)) {
    return "It closes before it opens. A close after midnight must be before 6am.";
  }
  const length = closes > opens ? closes - opens : closes + 24 * 60 - opens;
  if (length > 24 * 60) return "A day can't be open more than 24 hours.";
  return "";
}

/**
 * Seven days, Monday first, from a list in any order. Missing days are
 * missing (null), so validateWeek can say so; extra or repeated days throw.
 * @returns {(OpeningDay | null)[]}
 */
export function weekFrom(days) {
  const byDay = new Map();
  for (const raw of Array.isArray(days) ? days : []) {
    const day = openingDay(raw);
    if (!DAYS.includes(day.day)) throw problem(`"${raw?.day ?? ""}" is not a day of the week.`);
    if (byDay.has(day.day)) throw problem(`${DAY_NAMES[day.day]} is in the week twice.`);
    byDay.set(day.day, day);
  }
  return DAYS.map((key) => byDay.get(key) ?? null);
}

/**
 * The week checked: every day there and making sense.
 * @returns {{ days: OpeningDay[], problems: Partial<Record<DayKey, string>> }}
 */
export function validateWeek(input) {
  const week = weekFrom(input);
  /** @type {Partial<Record<DayKey, string>>} */
  const problems = {};
  week.forEach((day, index) => {
    const key = DAYS[index];
    const message = day ? dayProblem(day) : "Missing from the week.";
    if (message) problems[key] = message;
  });
  return { days: /** @type {OpeningDay[]} */ (week.filter(Boolean)), problems };
}

function problem(message) {
  const error = new Error(message);
  /** @type {any} */ (error).status = 400;
  return error;
}

/**
 * Throws a 400 that names each day's problem; returns the clean week.
 * @returns {OpeningDay[]}
 */
export function assertValidWeek(input) {
  const { days, problems } = validateWeek(input);
  const entries = Object.entries(problems);
  if (!entries.length) return days;
  const error = problem(
    entries.map(([key, message]) => `${DAY_NAMES[/** @type {DayKey} */ (key)]}: ${message}`).join(" "),
  );
  /** @type {any} */ (error).problems = problems;
  throw error;
}

/** "17:00" → "5pm", "22:30" → "10:30pm", "01:00" → "1am", "00:00" → "midnight". */
export function timeLabel(hhmm) {
  if (!isTime(hhmm)) return "";
  const total = minutesOf(hhmm);
  if (total === 0) return "midnight";
  if (total === 12 * 60) return "midday";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${hours < 12 ? "am" : "pm"}`;
}

/** A day in words for staff: "Closed", "5pm – 10:30pm", "4pm – 1am (Sunday morning)". */
export function dayHoursLabel(day) {
  if (day.closed) return "Closed";
  if (!isTime(day.opens) || !isTime(day.closes)) return "—";
  const range = `${timeLabel(day.opens)} – ${timeLabel(day.closes)}`;
  if (!closesAfterMidnight(day) || day.closes === "00:00") return range;
  const next = DAYS[(DAYS.indexOf(day.day) + 1) % DAYS.length];
  return `${range} (${DAY_NAMES[next]} morning)`;
}
