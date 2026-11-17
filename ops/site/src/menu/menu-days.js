/**
 * When a menu runs (#305): its dates and its days, and how ops says them.
 * Plain rules with no I/O, for the menu model on the server
 * (server/menu-model.js re-exports them) and for ops pages alike.
 *
 * A menu runs from `startsOn` to `endsOn` (YYYY-MM-DD each; "" for no start,
 * and "" for no end, an ongoing menu), on `days`: the weekdays it runs, as
 * "thu,fri,sat" in week order, Monday first. "" is every day, and so are all
 * seven.
 */

/** Weekdays as a menu stores them, Monday first (the events' ids too). */
export const MENU_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const SHORT_DAY = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A menu's status on a day: running, not started yet, or over. */
export const MENU_STATUSES = ["on", "coming", "ended"];

/** How ops says each status. */
export const MENU_STATUS_LABELS = { on: "On now", coming: "Coming up", ended: "Ended" };

/**
 * The days a menu runs, as given ("thu,fri", ["Thu", "fri"], "Thursday"),
 * in week order with no repeats. Every day comes back as [].
 * @returns {string[]}
 */
export function menuDayList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[\s,]+/);
  const wanted = new Set(raw.map((day) => String(day ?? "").trim().toLowerCase().slice(0, 3)));
  const days = MENU_DAYS.filter((day) => wanted.has(day));
  return days.length === MENU_DAYS.length ? [] : days;
}

/** The days as a menu stores them: "thu,fri,sat", or "" for every day. */
export function cleanMenuDays(value) {
  return menuDayList(value).join(",");
}

/** A real calendar day as YYYY-MM-DD, or "" for anything else. */
export function cleanMenuDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return "";
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? match[0]
    : "";
}

/**
 * The days in a few words: "Every day", "Sat", "Thu & Fri", "Wed–Sat",
 * "Mon, Wed & Fri". Three or more days in a row read as a range.
 */
export function menuDaysLabel(value) {
  const days = menuDayList(value);
  if (!days.length) return "Every day";
  const runs = [];
  for (const day of days) {
    const last = runs.at(-1);
    if (last && MENU_DAYS.indexOf(day) === MENU_DAYS.indexOf(last.at(-1)) + 1) last.push(day);
    else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3 ? [`${SHORT_DAY[run[0]]}–${SHORT_DAY[run.at(-1)]}`] : run.map((day) => SHORT_DAY[day]),
  );
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
}

/**
 * Whether a menu is on now, coming up or over on `today` (YYYY-MM-DD, the
 * bar's day): by its dates only. A menu that runs on Saturdays is on now on
 * a Monday between its dates.
 * @returns {"on" | "coming" | "ended"}
 */
export function menuStatus(menu, today) {
  const startsOn = cleanMenuDate(menu?.startsOn);
  const endsOn = cleanMenuDate(menu?.endsOn);
  if (endsOn && endsOn < today) return "ended";
  if (startsOn && startsOn > today) return "coming";
  return "on";
}

/** The weekday id ("mon" … "sun") of a YYYY-MM-DD. */
export function weekdayOf(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return MENU_DAYS[(day + 6) % 7];
}

/** Whether a menu runs on a day (YYYY-MM-DD): between its dates, on one of its days. */
export function menuRunsOn(menu, date) {
  if (!cleanMenuDate(date) || menuStatus(menu, date) !== "on") return false;
  const days = menuDayList(menu?.days);
  return !days.length || days.includes(weekdayOf(date));
}

function dayMonth(date, { year = false } = {}) {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ""}`;
}

/**
 * The dates in a few words: "ongoing", "12–30 Nov", "28 Nov – 3 Dec",
 * "from 1 Dec", "until 30 Nov". The year shows only when the dates span two.
 */
export function menuDatesLabel(menu) {
  const startsOn = cleanMenuDate(menu?.startsOn);
  const endsOn = cleanMenuDate(menu?.endsOn);
  if (!startsOn && !endsOn) return "ongoing";
  if (!endsOn) return `from ${dayMonth(startsOn)}`;
  if (!startsOn) return `until ${dayMonth(endsOn)}`;
  if (startsOn === endsOn) return dayMonth(startsOn);
  const year = startsOn.slice(0, 4) !== endsOn.slice(0, 4);
  if (!year && startsOn.slice(0, 7) === endsOn.slice(0, 7)) {
    return `${Number(startsOn.slice(8))}–${dayMonth(endsOn)}`;
  }
  return `${dayMonth(startsOn, { year })} – ${dayMonth(endsOn, { year })}`;
}
