import { readWeek, todayLine } from "../lib/opening-hours.js";

/**
 * Today's line (OpeningHours.astro), worked out in the visitor's browser:
 * the site is built ahead of time, so "open now" can't be. The week is on
 * the element (data-week); the line goes in it, by the clock in London.
 *
 * @param {Date} [now]
 */
export function initOpeningHours(now = new Date()) {
  for (const line of document.querySelectorAll("[data-hours-today]")) {
    let week = null;
    try {
      week = readWeek(JSON.parse(line.dataset.week || "null"));
    } catch {
      week = null;
    }
    const text = todayLine(week, now);
    line.textContent = text;
    line.hidden = !text;
    line.dataset.open = String(text.startsWith("Open now"));
  }
}
