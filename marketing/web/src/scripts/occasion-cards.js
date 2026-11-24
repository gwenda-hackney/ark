import { londonToday } from "../lib/london-day.js";

/**
 * Occasions on home, brought up to today (HomeOccasions.astro): the page is
 * built ahead of time, so each card shows only between its show days on the
 * visitor's day, and the section goes when none is on.
 *
 * @param {Date} [now]
 */
export function initOccasionCards(now = new Date()) {
  const today = londonToday(now);
  for (const section of document.querySelectorAll("[data-occasion-cards]")) {
    let shown = 0;
    for (const card of section.querySelectorAll("[data-occasion-from]")) {
      const { occasionFrom: from, occasionUntil: until } = card.dataset;
      card.hidden = !(from <= today && today <= until);
      if (!card.hidden) shown += 1;
    }
    section.hidden = shown === 0;
  }
}

/**
 * The occasions this phone or computer has seen pop up, by name, as a JSON
 * list. "*" stands for every one: a visitor who wants none (and the site's
 * own browser tests, playwright.config.js).
 */
export const SEEN_KEY = "gwenda:occasions-seen";
const SHEET_DELAY_MS = 1200;

function seenList() {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function seen(name) {
  const list = seenList();
  return list.includes("*") || list.includes(name);
}

function markSeen(name) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seenList(), name])]));
  } catch {
    // Private mode or storage off: it pops up again next visit.
  }
}

/**
 * The occasion on today (initOccasionCards decides which) slides up from the
 * foot a moment after the page loads, the card's own picture, words and Make
 * an enquiry: a sheet on a phone, a card rising into the middle of a wider
 * screen (chart-home.css). Closed (×, a tap on the shade, Escape), it goes, and the
 * card is still in the page where it always is. The phone remembers, by
 * occasion (localStorage): it rises once, and a new occasion rises once.
 *
 * @param {{ delay?: number }} [options]
 */
export function initOccasionSheet({ delay = SHEET_DELAY_MS } = {}) {
  const sheet = document.querySelector("[data-occasion-sheet]");
  const section = document.querySelector("[data-occasion-cards]");
  if (!sheet || !section || sheet.dataset.bound) return;
  const card = [...section.querySelectorAll(".ch-occasion")].find((one) => !one.hidden);
  if (!card) return;
  const name = card.querySelector(".ch-occasion-name")?.textContent?.trim() || "";
  if (seen(name)) return;
  sheet.dataset.bound = "1";

  function close() {
    markSeen(name);
    sheet.classList.remove("is-open");
    setTimeout(() => sheet.open && sheet.close(), 420);
  }
  sheet.querySelector("[data-sheet-close]")?.addEventListener("click", close);
  // A tap on the shade around the sheet closes it; so does Escape.
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) close();
  });
  sheet.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  setTimeout(() => {
    const body = sheet.querySelector("[data-sheet-body]");
    if (body && !body.firstChild) {
      const copy = card.cloneNode(true);
      copy.hidden = false;
      body.append(copy);
    }
    sheet.showModal();
    // The window takes the keyboard, not × (which would show its ring at once).
    sheet.focus();
    requestAnimationFrame(() => sheet.classList.add("is-open"));
  }, delay);
}
