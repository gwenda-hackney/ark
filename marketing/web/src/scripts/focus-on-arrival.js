/**
 * Focus on arrival (#240): someone who follows a link to a form finds the
 * cursor in its first box ("Get on the list" lands in the email box, Book
 * your party in the name box). The page says where, in its markup:
 *
 * - `data-focus-on-arrival="page"` on the part of a page that is the page's
 *   whole point (/join-list, /contact/<form>). Every visit puts the cursor in
 *   it. When the box starts below the fold (a phone, under the photo), the
 *   page scrolls it up first, its label and the form's opening line with it.
 * - `data-focus-on-arrival="anchor"` on a part, with an id, of a page that
 *   holds a form among other things (Contact's "Get on the list"). Only when
 *   the address points at that part or into it (/contact#list): arriving, or
 *   by a link on the page itself.
 *
 * Any other visit leaves focus alone. It never takes the cursor from
 * something the visitor has already put it in, never after they've started
 * to click, tap, type or scroll, and on back/forward never scrolls the page
 * (it lands where they left it).
 */

import {
  isRestoredNavigation,
  whenScrollSettled,
} from "./navigation-restore.js";
import { hashTarget } from "./page-anchors.js";

const ATTR = "data-focus-on-arrival";
/** Boxes someone types into. Dates, ticks and choices open pickers or do nothing with a cursor. */
const TEXT_TYPES = new Set([
  "text",
  "email",
  "tel",
  "url",
  "search",
  "number",
  "password",
]);
/** Air above the label once scrolled, as the page's jump links leave (chart.css). */
const LANDING_AIR = 16;

/**
 * A box someone can type into now: shown, enabled, empty, in the tab order.
 * The honeypot (aria-hidden, tabindex -1), an "Other" box still hidden, and
 * a themed dropdown's native select all fail.
 *
 * @param {Element} el
 */
export function isFillable(el) {
  if (el instanceof HTMLInputElement) {
    if (!TEXT_TYPES.has(el.type)) return false;
  } else if (!(el instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (el.matches(":disabled") || el.readOnly || el.tabIndex < 0) return false;
  if (el.value !== "") return false;
  if (el.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  if (
    typeof el.checkVisibility === "function" &&
    !el.checkVisibility({ visibilityProperty: true })
  ) {
    return false;
  }
  return true;
}

/**
 * The first box to type into, in or at `root`.
 *
 * @param {Element} root
 * @returns {HTMLInputElement | HTMLTextAreaElement | null}
 */
export function firstFillable(root) {
  const boxes = root.matches("input, textarea")
    ? [root]
    : root.querySelectorAll("input, textarea");
  for (const box of boxes) {
    if (isFillable(box)) {
      return /** @type {HTMLInputElement | HTMLTextAreaElement} */ (box);
    }
  }
  return null;
}

/**
 * The box this visit is for, or null when it isn't for a form.
 *
 * The address's hash wins when it points at a marked part or into one (the
 * first box from there on). Otherwise, unless `hashOnly`, a page's own form.
 *
 * @param {Document} doc
 * @param {string} hash
 * @param {{ hashOnly?: boolean }} [options]
 * @returns {{
 *   field: HTMLInputElement | HTMLTextAreaElement,
 *   part: Element,
 *   mode: "page" | "anchor",
 * } | null}
 */
export function arrivalField(doc, hash, { hashOnly = false } = {}) {
  const parts = [...doc.querySelectorAll(`[${ATTR}]`)];
  const modeOf = (part) =>
    part.getAttribute(ATTR) === "page" ? "page" : "anchor";
  const target = hashTarget(doc, hash);
  const pointedAt = target
    ? parts.find((part) => part === target || part.contains(target))
    : undefined;
  if (pointedAt) {
    const field = firstFillable(target) ?? firstFillable(pointedAt);
    return field ? { field, part: pointedAt, mode: modeOf(pointedAt) } : null;
  }
  if (hashOnly) return null;
  const page = parts.find((part) => modeOf(part) === "page");
  const field = page ? firstFillable(page) : null;
  return page && field ? { field, part: page, mode: "page" } : null;
}

/** Something already has focus: the visitor put it there, or we already did. */
function focusTaken(doc) {
  const active = doc.activeElement;
  return Boolean(
    active && active !== doc.body && active !== doc.documentElement,
  );
}

/**
 * What of the page is clear of the fixed bar and dock: the root keeps them
 * as its scroll padding (chart.css).
 *
 * @param {Window} win
 */
function clearBand(win) {
  const style = win.getComputedStyle(win.document.documentElement);
  const top = Number.parseFloat(style.scrollPaddingTop) || 0;
  const bottom = Number.parseFloat(style.scrollPaddingBottom) || 0;
  return { top, bottom: win.innerHeight - bottom };
}

/**
 * The box with its label: what has to be on screen. The form's opening (the
 * "we need the ones marked" line, the first heading) comes too when it fits
 * in half of what's clear, so a phone's keyboard can't cover the box.
 *
 * @param {HTMLInputElement | HTMLTextAreaElement} field
 * @param {Element} part
 * @param {{ top: number, bottom: number }} band
 */
function landingBox(field, part, band) {
  const box = field.getBoundingClientRect();
  let top = box.top;
  for (const label of field.labels ?? []) {
    const rect = label.getBoundingClientRect();
    // A label only for screen readers is a 1px speck somewhere: not a line.
    if (rect.width > 1 && rect.height > 1) top = Math.min(top, rect.top);
  }
  const partTop = part.getBoundingClientRect().top;
  if (partTop < top && box.bottom - partTop <= (band.bottom - band.top) / 2) {
    top = partTop;
  }
  return { top, bottom: box.bottom };
}

/**
 * Put the cursor in the box, scrolling it on screen first when `scroll`.
 * False when it's off screen and may not scroll: a cursor in a box no one can
 * see would take the keys meant for scrolling.
 *
 * @param {HTMLInputElement | HTMLTextAreaElement} field
 * @param {Element} part
 * @param {{ scroll: boolean, win: Window }} options
 */
function land(field, part, { scroll, win }) {
  const band = clearBand(win);
  const box = landingBox(field, part, band);
  const onScreen = box.top >= band.top && box.bottom <= band.bottom;
  if (!onScreen) {
    if (!scroll) return false;
    const reduced = win.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    win.scrollTo({
      top: win.scrollY + box.top - band.top - LANDING_AIR,
      behavior: reduced ? "auto" : "smooth",
    });
  }
  field.focus({ preventScroll: true });
  return true;
}

/**
 * Run on every page (first load and each View Transitions swap).
 *
 * @param {{ signal?: AbortSignal, doc?: Document, win?: Window }} [options]
 */
export function initFocusOnArrival({
  signal,
  doc = document,
  win = window,
} = {}) {
  // Once the visitor does anything, a landing still to come stands down.
  let touched = false;
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    win.addEventListener(
      type,
      () => {
        touched = true;
      },
      { capture: true, passive: true, signal },
    );
  }

  // A link on this page to a form on it (Contact's "Get on the list"): the
  // page's own jump scrolls; the cursor follows once the click is through.
  doc.addEventListener(
    "click",
    (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const here = win.location;
      if (
        link.origin !== here.origin ||
        link.pathname !== here.pathname ||
        link.search !== here.search
      ) {
        return;
      }
      const arrival = arrivalField(doc, link.hash, { hashOnly: true });
      if (!arrival) return;
      win.requestAnimationFrame(() => {
        if (signal?.aborted || !arrival.field.isConnected) return;
        arrival.field.focus({ preventScroll: true });
      });
    },
    { signal },
  );

  const arrival = arrivalField(doc, win.location.hash);
  if (!arrival || focusTaken(doc)) return;
  const { field, part, mode } = arrival;

  // Pointed at by the address: its jump has the page where it should be.
  if (mode === "anchor") {
    field.focus({ preventScroll: true });
    return;
  }

  // The page's own form, already on screen: the page stays at the top.
  if (land(field, part, { scroll: false, win })) return;
  // Back/forward lands where the visitor left: leave it there.
  if (isRestoredNavigation()) return;

  // Below the fold: once the arrival's own scrolling is done, and the fonts
  // have set the lines where they'll stay, bring it up.
  whenScrollSettled(() => {
    const fontsReady = doc.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => {
      if (signal?.aborted || touched || focusTaken(doc)) return;
      if (!field.isConnected || !isFillable(field)) return;
      land(field, part, { scroll: true, win });
    });
  });
}
