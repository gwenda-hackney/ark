/**
 * The day at the bar (#240). The site is built ahead of time, so pages that
 * list nights check the date again in the browser (scripts/night-cards.js)
 * and a night that has passed since the build drops off.
 */

/** Today at the bar, "2026-11-10", whatever clock the visitor's on. */
export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function utcDay(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole days from one day to another; negative when it has passed. */
export function daysAway(dateIso, todayIso) {
  return Math.round((utcDay(dateIso) - utcDay(todayIso)) / 86400000);
}

/** The Monday of a day's week: weeks at the bar run Monday to Sunday. */
export function weekStart(dateIso) {
  const day = new Date(utcDay(dateIso));
  // getUTCDay: Sunday 0 … Saturday 6; Monday is the first day.
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
