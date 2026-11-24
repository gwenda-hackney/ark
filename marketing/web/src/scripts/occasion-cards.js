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

/** Phones: where the occasion peeks up from the bottom instead of sitting in the page. */
export const PEEK_QUERY = "(max-width: 48rem)";
const DISMISSED = "gwenda:occasion-peek-hidden:";
const PEEK_DELAY_MS = 1200;

function dismissed(name) {
  try {
    return sessionStorage.getItem(DISMISSED + name) === "1";
  } catch {
    return false;
  }
}

function dismiss(name) {
  try {
    sessionStorage.setItem(DISMISSED + name, "1");
  } catch {
    // Private mode: it just comes back next page.
  }
}

/**
 * On a phone, the occasion on today (initOccasionCards decides which) peeks
 * up from the bottom: its picture, Booking now, its name. Tapping it slides
 * the whole occasion up in a sheet, the card's own words and Make an
 * enquiry; × hides the bar for this visit. The card in the page goes, so
 * it's in one place. Without the script, or wider than a phone, the card
 * stays in the page.
 *
 * @param {{ delay?: number }} [options]
 */
export function initOccasionPeek({ delay = PEEK_DELAY_MS } = {}) {
  const peek = document.querySelector("[data-occasion-peek]");
  const sheet = document.querySelector("[data-occasion-sheet]");
  const section = document.querySelector("[data-occasion-cards]");
  if (!peek || !sheet || !section || peek.dataset.bound) return;
  if (!window.matchMedia?.(PEEK_QUERY).matches) return;
  const card = [...section.querySelectorAll(".ch-occasion")].find((one) => !one.hidden);
  if (!card) return;
  const name = card.querySelector(".ch-occasion-name")?.textContent?.trim() || "";
  peek.dataset.bound = "1";
  section.classList.add("is-peeked");

  const picture = card.querySelector(".ch-occasion-photo img");
  const thumb = peek.querySelector("[data-peek-img]");
  if (picture && thumb) thumb.src = picture.currentSrc || picture.src;
  else thumb?.remove();
  const label = peek.querySelector("[data-peek-name]");
  if (label) label.textContent = name;

  const body = sheet.querySelector("[data-sheet-body]");
  function open() {
    if (body && !body.firstChild) {
      const copy = card.cloneNode(true);
      copy.hidden = false;
      body.append(copy);
    }
    sheet.showModal();
    requestAnimationFrame(() => sheet.classList.add("is-open"));
  }
  function close() {
    sheet.classList.remove("is-open");
    setTimeout(() => sheet.open && sheet.close(), 220);
  }
  peek.querySelector("[data-peek-open]")?.addEventListener("click", open);
  peek.querySelector("[data-peek-close]")?.addEventListener("click", () => {
    dismiss(name);
    peek.classList.remove("is-up");
    setTimeout(() => (peek.hidden = true), 250);
  });
  sheet.querySelector("[data-sheet-close]")?.addEventListener("click", close);
  // A tap on the shade around the sheet closes it; Escape does by itself.
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) close();
  });
  sheet.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  if (dismissed(name)) return;
  setTimeout(() => {
    peek.hidden = false;
    requestAnimationFrame(() => peek.classList.add("is-up"));
  }, delay);
}
