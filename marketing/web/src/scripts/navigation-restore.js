/**
 * Back/forward navigation should feel instant: the page renders in its final
 * state (no entrance animations) and scroll lands where the user left off.
 *
 * Astro View Transitions soft-navigations use `navigationType: "traverse"` for
 * browser back/forward. The Performance Navigation Timing entry stays as the
 * original full load, so we mark restore from the Astro event as well.
 *
 * Critical: Astro's `swapRootAttributes` replaces ALL `<html>` attributes with
 * the inbound document's, which wipes client-only classes (`fonts-ready`,
 * `navigation-restore`, …). Re-apply those after every swap or the hero logo
 * stays at `.enter-stagger { opacity: 0 }` forever.
 */

import { ensureFontsReadyClass } from "./fonts-ready.js";

/** True when this paint should skip entrance motion (hard or soft restore). */
export function isRestoredNavigation() {
  if (document.documentElement.classList.contains("navigation-restore")) {
    return true;
  }
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    return nav?.type === "back_forward";
  } catch {
    return false;
  }
}

function markRestore() {
  document.documentElement.classList.add("navigation-restore", "fonts-ready");
}

function clearRestore() {
  document.documentElement.classList.remove("navigation-restore");
}

/** Force every deferred/animated element into its resting, visible state. */
export function settleAnimations() {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
  document.querySelectorAll(".enter-scene").forEach((el) => el.classList.add("is-visible"));
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

export function initNavigationRestore() {
  // Belt-and-suspenders: the inline <head> script sets this before paint, but
  // set it here too in case that script didn't run.
  if (isRestoredNavigation()) {
    markRestore();
    settleAnimations();
  }

  if (hooksBound) return;
  hooksBound = true;

  // BFCache restore — the browser already preserved scroll + DOM; just make
  // sure nothing is mid-animation.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    markRestore();
    settleAnimations();
  });

  // View Transitions: browser back/forward is `traverse`, not Performance
  // `back_forward`. Remember across swap — html classes get wiped.
  document.addEventListener("astro:before-preparation", (event) => {
    if (event.navigationType === "traverse") {
      pendingRestore = true;
      markRestore();
    } else {
      pendingRestore = false;
      clearRestore();
    }
  });

  document.addEventListener("astro:after-swap", () => {
    // swapRootAttributes wiped client classes — put them back.
    ensureFontsReadyClass();
    document.documentElement.classList.add("gw-scrollbar-ready");

    if (pendingRestore) {
      markRestore();
      settleAnimations();
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
