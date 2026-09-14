/**
 * Back/forward navigation should feel instant: the page renders in its final
 * state (no entrance animations) and the browser's native scroll restoration
 * lands the user exactly where they were — no manual scroll juggling, which
 * only fights the browser and causes jumps.
 */

/** True when the page was opened via the browser back/forward buttons. */
export function isRestoredNavigation() {
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

/** Force every deferred/animated element into its resting, visible state. */
function settleAnimations() {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("visible"));
  document.querySelectorAll(".enter-scene").forEach((el) => el.classList.add("is-visible"));
  document.querySelectorAll(".enter-stagger").forEach((el) => {
    el.style.opacity = "1";
    el.style.transform = "none";
  });
  document.querySelector(".hero-image")?.classList.add("is-visible");
  document.querySelector(".hero-media")?.classList.add("is-ready");
}

export function initNavigationRestore() {
  // Belt-and-suspenders: the inline <head> script sets this before paint, but
  // set it here too in case that script didn't run.
  if (isRestoredNavigation()) {
    markRestore();
    settleAnimations();
  }

  // BFCache restore — the browser already preserved scroll + DOM; just make
  // sure nothing is mid-animation.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    markRestore();
    settleAnimations();
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
