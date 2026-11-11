import { londonToday } from "../lib/london-day.js";
import { whenOnDay } from "../lib/stand-when.js";

/**
 * Deal and pop-up kitchen cards, brought up to today (StandingCards.astro):
 * the site is built ahead of time, so each card carries what its "when"
 * line says over its coming nights (data-stand-when) and its last night
 * (data-stand-last). Past its first night the card says the line for today;
 * past its last it goes, and so does a kind's section, and home's row, with
 * nothing left in them.
 *
 * @param {Date} [now]
 */
export function initStandCards(now = new Date()) {
  const today = londonToday(now);
  for (const card of document.querySelectorAll("[data-stand-when]")) {
    let timeline = [];
    try {
      timeline = JSON.parse(card.dataset.standWhen || "[]");
    } catch {
      continue;
    }
    const text = whenOnDay(timeline, card.dataset.standLast || "", today);
    card.hidden = text === null;
    const line = card.querySelector("[data-stand-when-line]");
    if (typeof text === "string" && line) {
      if (line.textContent !== text) line.textContent = text;
      line.hidden = !text;
    }
  }
  for (const section of document.querySelectorAll(".ch-stand-section")) {
    const cards = section.querySelectorAll("[data-stand-when]");
    if (!cards.length) continue;
    section.hidden = [...cards].every((card) => card.hidden);
  }
  for (const row of document.querySelectorAll(".ch-stand-row")) {
    const sections = row.querySelectorAll(".ch-stand-section");
    row.hidden = [...sections].every((section) => section.hidden);
  }
}
