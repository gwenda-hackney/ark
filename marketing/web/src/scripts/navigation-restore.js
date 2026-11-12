/**
 * Back/forward navigation should feel instant: the page renders in its final
 * state (no entrance animations) and scroll lands where the user left off.
 *
 * Astro View Transitions soft-navigations use `navigationType: "traverse"` for
 * browser back/forward. The Performance Navigation Timing entry stays as the
 * original full load, so we mark restore from the Astro event as well.
 *
 * Two marks on `<html>`, for two different spans of time:
 *
 * - `navigation-restore`: this visit came by back/forward, so it was painted
 *   in its final state. It stays for the visit.
 * - `is-restoring-scroll`: the restored offset is landing, so scrolling is
 *   instant (global.css): a smooth one would glide to it, or fight it. It
 *   goes once the offset has landed, and the page's jump links glide again;
 *   left on, every jump on home was instant after a Back.
 *
 * Critical: Astro's `swapRootAttributes` replaces ALL `<html>` attributes with
 * the inbound document's, which wipes client-only classes (`fonts-ready`,
 * `navigation-restore`, …). Re-apply those after every swap or the hero logo
 * stays at `.enter-stagger { opacity: 0 }` forever.
 *
 * A reload is not a restore: one of an address with an #anchor lands on it
 * (holdAnchorOnReload).
 */

import { ensureFontsReadyClass } from "./fonts-ready.js";
import { hashTarget } from "./page-anchors.js";

const RESTORING_SCROLL = "is-restoring-scroll";

/**
 * How the document itself was loaded: "navigate", "reload", "back_forward"
 * (and not from the cache), or "" when the browser can't say. It stays the
 * same for every router visit after the first.
 */
function documentLoadType() {
  try {
    return performance.getEntriesByType("navigation")[0]?.type ?? "";
  } catch {
    return "";
  }
}

function loadedByBackForward() {
  return documentLoadType() === "back_forward";
}

/**
 * Whether the visit in view came by back/forward, once the hooks are bound
 * (initNavigationRestore): set from the document's load, then again as each
 * router visit starts and when the back-forward cache brings the page back.
 * The document's navigation timing is its first visit's for good, so after a
 * Back that loaded the page, it would call every later visit a restore.
 *
 * @type {boolean | null}
 */
let visitRestored = null;

/** True when this paint should skip entrance motion (hard or soft restore). */
export function isRestoredNavigation() {
  if (document.documentElement.classList.contains("navigation-restore")) {
    return true;
  }
  return visitRestored ?? loadedByBackForward();
}

/** The landing in progress; an older one's end leaves a newer one alone. */
let landing = 0;

/** @param {HTMLElement} [root] the page's root, or the one coming in */
function markRestore(root = document.documentElement) {
  root.classList.add("navigation-restore", "fonts-ready", RESTORING_SCROLL);
  landing += 1;
}

function clearRestore() {
  landing += 1;
  document.documentElement.classList.remove(
    "navigation-restore",
    RESTORING_SCROLL,
  );
}

/**
 * The restored offset has landed: once the page has loaded (the browser's
 * own restore, on a full load, comes with the load event) and two frames
 * have drawn it, scrolling is the page's own again.
 */
function endLanding() {
  const mine = landing;
  const end = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (mine !== landing) return;
        document.documentElement.classList.remove(RESTORING_SCROLL);
      }),
    );
  if (document.readyState === "complete") end();
  else window.addEventListener("load", end, { once: true });
}

/** Force every deferred/animated element into its resting, visible state. */
export function settleAnimations() {
  document
    .querySelectorAll(".reveal")
    .forEach((el) => el.classList.add("visible"));
  document
    .querySelectorAll(".enter-scene")
    .forEach((el) => el.classList.add("is-visible"));
  document.querySelectorAll(".enter-stagger").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.opacity = "1";
    el.style.transform = "none";
    el.style.animation = "none";
  });
  document.querySelector(".hero-image")?.classList.add("is-visible");
  document.querySelector(".hero-media")?.classList.add("is-ready");
}

let hooksBound = false;
/** Set in before-preparation; survives the html class wipe during swap. */
let pendingRestore = false;
/** Forward visits should open at the top. A carried scroll offset lands on the last anchor. */
let pendingScrollPin = false;
let scrollPin = 0;

/**
 * Back/forward keeps the old offset. A new page with no hash starts at the top.
 *
 * @param {string | undefined} navigationType
 * @param {string | undefined} href
 */
export function shouldPinScrollTop(navigationType, href) {
  if (navigationType === "traverse") return false;
  const value = String(href || "");
  const hash = value.includes("#") ? value.slice(value.indexOf("#")) : "";
  return hash.length < 2;
}

function pinScrollTop() {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
}

/** Waiting for the last pin of the visit in progress (whenScrollSettled). */
/** @type {Array<() => void>} */
let afterScrollPin = [];
let scrollPinPending = false;

/** Chrome can put the previous page's offset back when the crossfade ends. */
function scheduleScrollPin() {
  const pin = ++scrollPin;
  scrollPinPending = true;
  pinScrollTop();
  const finish = () => {
    if (pin !== scrollPin || location.hash.length > 1) return;
    pinScrollTop();
  };
  requestAnimationFrame(() => requestAnimationFrame(finish));
  window.setTimeout(() => {
    finish();
    if (pin !== scrollPin) return;
    scrollPinPending = false;
    const waiting = afterScrollPin;
    afterScrollPin = [];
    for (const fn of waiting) fn();
  }, 560);
}

/**
 * Run something that scrolls the page on arrival once the arrival's own
 * scrolling is done: a restored offset has landed (whenNavigationReady), and
 * a new page's pin to the top has run its last time, or it would put the page
 * back at the top under it.
 *
 * @param {() => void} fn
 */
export function whenScrollSettled(fn) {
  whenNavigationReady(() => {
    if (scrollPinPending) afterScrollPin.push(fn);
    else fn();
  });
}

/** How long the section has to stay put, once the page is in, to be left there. */
const ANCHOR_STILL_MS = 500;
/** The longest a reload's section is held, whatever keeps moving the page. */
const ANCHOR_HOLD_MS = 10_000;

/**
 * A reload of an address with an #anchor (/#bookings, /bookings#play) lands
 * that section at the top, under what's fixed there, as following a link to
 * it does. Left alone, it lands wherever the visitor had scrolled to: the
 * router keeps that offset in the history entry, and on every load that has
 * an entry's offset, a reload too, scrolls back to it, with the browser's own
 * restoring (which would go to the anchor) turned off.
 *
 * The section is held there while the page comes in (the router's scroll
 * back, the styles, the fonts, images above it, home's hero), until the page
 * has loaded and it has stayed put a moment, the visitor scrolls, clicks,
 * taps or types, or they go on to another page. The jump is instant, as the
 * browser's own landing on an anchor is: nothing glides, so reduced motion
 * has nothing to stop. A reload without an anchor, a first visit (the
 * browser lands it) and back/forward (the left offset) are left as they are.
 *
 * Once per document: its load type stays "reload" for every router visit
 * after it.
 *
 * @param {{ win?: Window, doc?: Document }} [options]
 */
export function holdAnchorOnReload({ win = window, doc = document } = {}) {
  if (documentLoadType() !== "reload") return;
  const target = hashTarget(doc, win.location.hash);
  if (!target) return;

  const holding = new AbortController();
  const { signal } = holding;
  const release = () => holding.abort();
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    win.addEventListener(type, release, {
      capture: true,
      passive: true,
      signal,
    });
  }
  win.addEventListener("pagehide", release, { signal });
  doc.addEventListener("astro:before-preparation", release, { signal });
  const giveUp = win.setTimeout(release, ANCHOR_HOLD_MS);
  signal.addEventListener("abort", () => win.clearTimeout(giveUp));

  // In: loaded (images and all), with the fonts set
  let pageIn = false;
  const loaded =
    doc.readyState === "complete"
      ? Promise.resolve()
      : new Promise((resolve) =>
          win.addEventListener("load", resolve, { once: true, signal }),
        );
  void Promise.all([loaded, doc.fonts?.ready]).then(() => {
    pageIn = true;
  });

  /** Puts the section at the top: true when it had moved off it. */
  const land = () => {
    const from = win.scrollY;
    target.scrollIntoView({ block: "start", behavior: "instant" });
    return win.scrollY !== from;
  };

  land();
  let stillSince = -1;
  /** @param {number} time */
  const hold = (time) => {
    if (signal.aborted) return;
    if (!target.isConnected) {
      release();
      return;
    }
    if (land() || !pageIn || stillSince < 0) stillSince = time;
    else if (time - stillSince >= ANCHOR_STILL_MS) {
      release();
      return;
    }
    win.requestAnimationFrame(hold);
  };
  win.requestAnimationFrame(hold);
}

export function initNavigationRestore() {
  // Belt-and-suspenders: the inline <head> script sets this before paint, but
  // set it here too in case that script didn't run.
  if (isRestoredNavigation()) {
    markRestore();
    settleAnimations();
    endLanding();
  }

  if (hooksBound) return;
  hooksBound = true;
  visitRestored = isRestoredNavigation();
  holdAnchorOnReload();

  // BFCache restore — the browser already preserved scroll + DOM; just make
  // sure nothing is mid-animation.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    visitRestored = true;
    markRestore();
    settleAnimations();
    endLanding();
  });

  // View Transitions: browser back/forward is `traverse`, not Performance
  // `back_forward`. Remember across swap — html classes get wiped.
  document.addEventListener("astro:before-preparation", (event) => {
    visitRestored = event.navigationType === "traverse";
    if (event.navigationType === "traverse") {
      pendingRestore = true;
      pendingScrollPin = false;
      markRestore();
    } else {
      pendingRestore = false;
      pendingScrollPin = shouldPinScrollTop(
        event.navigationType,
        event.to?.href,
      );
      clearRestore();
    }
  });

  // The router scrolls to the saved offset after it has swapped the root's
  // attributes for the new page's: the marks go on the new page's root, so
  // they are there for it.
  document.addEventListener("astro:before-swap", (event) => {
    if (pendingRestore) markRestore(event.newDocument.documentElement);
  });

  document.addEventListener("astro:after-swap", () => {
    // swapRootAttributes wiped client classes — put them back.
    ensureFontsReadyClass();

    if (pendingRestore) {
      // The router has scrolled to the saved offset by now
      markRestore();
      settleAnimations();
      endLanding();
    } else if (pendingScrollPin) {
      scheduleScrollPin();
    }
  });
}

/**
 * Run scroll-sensitive setup once the restored scroll position has settled.
 * On back/forward the browser restores scroll around the load event, so wait a
 * frame; on a fresh load run immediately.
 */
export function whenNavigationReady(fn) {
  if (!isRestoredNavigation()) {
    fn();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
