import { londonToday } from "../lib/london-day.js";

/**
 * Seasons on home, brought up to today (HomeSeasons.astro): the page is
 * built ahead of time, so each card shows only between its show days on the
 * visitor's day, and the section goes when none is on.
 *
 * @param {Date} [now]
 */
export function initSeasonCards(now = new Date()) {
  const today = londonToday(now);
  for (const section of document.querySelectorAll("[data-season-cards]")) {
    let shown = 0;
    for (const card of section.querySelectorAll("[data-season-from]")) {
      const { seasonFrom: from, seasonUntil: until } = card.dataset;
      card.hidden = !(from <= today && today <= until);
      if (!card.hidden) shown += 1;
    }
    section.hidden = shown === 0;
  }
}
