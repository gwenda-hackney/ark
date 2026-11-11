import { londonToday } from "../lib/london-day.js";
import {
  LEAD_NIGHT_SIZES,
  nightLabel,
  nightsToShow,
  thisWeekDays,
  weekLabel,
} from "../lib/night-cards.js";

/**
 * Night cards, brought up to today (NightCards.astro): the site is built
 * ahead of time, so a night that has passed since is dropped, the next one
 * leads, and each is called what it is now (Tonight, Tomorrow). The one
 * that leads now is shown big, so its picture is asked for at that size
 * (the img's `sizes`; its size in a row is kept in data-row-sizes). An event
 * over several days (data-night-end) stays until its last. Where only this
 * week's show (data-this-week, home's: today to Sunday, on the visitor's
 * day, not the build's), next week's spare cards stay hidden until its
 * Monday, and the empty line shows if none is on. Where they
 * are under weeks, each week is named again too (This week, Next week), and
 * a week with no night left goes.
 *
 * @param {Date} [now]
 */
export function initNightCards(now = new Date()) {
  const today = londonToday(now);
  for (const list of document.querySelectorAll("[data-night-cards]")) {
    const nights = [...list.querySelectorAll("[data-night]")];
    const shown = nightsToShow(
      nights.map((night) => night.dataset.night),
      today,
      Number(list.dataset.shown) || Infinity,
      nights.map((night) => night.dataset.nightEnd),
      "thisWeek" in list.dataset ? thisWeekDays(today) : Infinity,
    );

    nights.forEach((night, index) => {
      const place = shown.indexOf(index);
      night.hidden = place < 0;
      night.classList.toggle("ch-night--lead", place === 0);
      const photo = night.querySelector("img[data-row-sizes]");
      const sizes = place === 0 ? LEAD_NIGHT_SIZES : photo?.dataset.rowSizes;
      if (photo && photo.sizes !== sizes) photo.sizes = sizes;
      const { night: start, nightEnd: end = start } = night.dataset;
      night.classList.toggle(
        "ch-night--tonight",
        start <= today && today <= end,
      );
      const label = night.querySelector("[data-night-label]");
      if (label) label.textContent = nightLabel(start, today, end);
    });

    for (const week of list.querySelectorAll("[data-night-week]")) {
      week.hidden = !week.querySelector("[data-night]:not([hidden])");
      const label = week.querySelector("[data-night-week-label]");
      if (label) label.textContent = weekLabel(week.dataset.nightWeek, today);
    }

    const empty = list.querySelector("[data-night-cards-empty]");
    if (empty) empty.hidden = shown.length > 0;
  }
}
