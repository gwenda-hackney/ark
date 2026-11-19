import { dayLabel } from "../lib/day-label.js";
import { londonToday } from "../lib/london-day.js";
import { weekLabel } from "../lib/night-cards.js";

/**
 * What's on by date, brought up to today (DayCards.astro): the site is
 * built ahead of time, so a day that has passed since is dropped (an event
 * over several days keeps its day until its last, data-day-end), no more
 * than `data-shown` show (home's), each day
 * is called what it is now (Tonight, Tomorrow), a week with no day left
 * goes and the rest are named again (This week, Next week).
 *
 * @param {Date} [now]
 */
export function initDayCards(now = new Date()) {
  const today = londonToday(now);
  for (const list of document.querySelectorAll("[data-day-cards]")) {
    const most = Number(list.dataset.shown) || Infinity;
    let shown = 0;
    for (const day of list.querySelectorAll("[data-day]")) {
      const { day: start, dayEnd: end = start } = day.dataset;
      day.hidden = end < today || shown >= most;
      if (!day.hidden) shown += 1;
      day.classList.toggle("ch-day--tonight", start <= today && today <= end);
      const label = day.querySelector("[data-day-label]");
      if (label) {
        const text = dayLabel(start, today, end);
        label.textContent = text;
        label.hidden = !text;
      }
    }
    // Coming up later: a card goes once its series is in a day showing.
    const onShow = new Set(
      [...list.querySelectorAll("[data-day]:not([hidden])")].flatMap((day) =>
        (day.dataset.daySeries || "").split(" ").filter(Boolean),
      ),
    );
    for (const card of list.querySelectorAll(".ch-day-later [data-series]")) {
      card.hidden = onShow.has(card.dataset.series);
    }
    const later = list.querySelector(".ch-day-later");
    if (later)
      later.hidden = !later.querySelector("[data-series]:not([hidden])");

    for (const week of list.querySelectorAll("[data-day-week]")) {
      week.hidden = !week.querySelector("[data-day]:not([hidden])");
      const label = week.querySelector("[data-day-week-label]");
      if (label) label.textContent = weekLabel(week.dataset.dayWeek, today);
    }
    const empty = list.querySelector("[data-day-cards-empty]");
    if (empty) empty.hidden = shown > 0;
  }
}
