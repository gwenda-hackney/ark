/**
 * Fade in the hero background once its <img> has usable pixels.
 * Handles preload/cache races where `load` never fires after `complete`.
 *
 * Must run on every `astro:page-load` — View Transitions reuses the module,
 * so a one-shot call from Hero.astro never re-fires when returning home.
 * The wordmark stagger itself only restarts after a swap. `initPage` also
 * runs on the first paint and again on `window` `load`, and replaying the
 * fade on that second call blinks the logo.
 *
 * Astro swaps wipe `html.fonts-ready` (see navigation-restore.js). After that
 * is restored, restart CSS stagger — and wait until view-transition page fades
 * finish, otherwise the stagger is cancelled and the logo stays at opacity 0.
 */
import { whenImageReady } from "./entrance-motion.js";
import { ensureFontsReadyClass } from "./fonts-ready.js";

/** @returns {Animation[]} */
function viewTransitionAnimations() {
  if (typeof document.getAnimations !== "function") return [];
  return document.getAnimations().filter((animation) => {
    try {
      const pseudo = animation.effect?.pseudoElement;
      return typeof pseudo === "string" && pseudo.includes("view-transition");
    } catch {
      return false;
    }
  });
}

/** Resolve after in-flight View Transition page fades settle (or immediately). */
export function whenViewTransitionSettled() {
  const animations = viewTransitionAnimations();
  if (animations.length === 0) {
    // updateCallbackDone can beat the first VT paint frame — wait two frames.
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  return Promise.race([
    Promise.all(
      animations.map((animation) => animation.finished.catch(() => undefined)),
    ),
    new Promise((resolve) => window.setTimeout(resolve, 600)),
  ]);
}

function forceEnterStaggerVisible() {
  document
    .querySelectorAll(".enter-stagger--auto, .hero-content .enter-stagger")
    .forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.style.opacity = "1";
      el.style.transform = "none";
      el.style.animation = "none";
    });
}

/** Restart CSS stagger on newly swapped hero nodes when fonts-ready is set. */
export function restartEnterStaggerAuto() {
  ensureFontsReadyClass();

  const root = document.documentElement;
  if (root.classList.contains("navigation-restore")) {
    forceEnterStaggerVisible();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    forceEnterStaggerVisible();
    return;
  }
  if (!root.classList.contains("fonts-ready")) {
    // Still waiting on fonts — show logo rather than leave it invisible.
    forceEnterStaggerVisible();
    return;
  }

  document.querySelectorAll(".enter-stagger--auto").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.removeProperty("animation");
  });

  // If the restart was cancelled again, never leave the logo invisible.
  window.setTimeout(() => {
    document.querySelectorAll(".enter-stagger--auto").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (
        el.classList.contains("hero-logo") &&
        !el.classList.contains("is-decoded")
      ) {
        return;
      }
      if (Number.parseFloat(getComputedStyle(el).opacity) < 0.05) {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.animation = "none";
      }
    });
  }, 1100);
}

/** Set on swap; consumed by the next reveal so a full load does not replay. */
let restartStaggerOnNextReveal = false;

document.addEventListener("astro:after-swap", () => {
  restartStaggerOnNextReveal = true;
});

function whenHeroLogoDecoded() {
  const logo = document.querySelector(".hero-logo");
  if (!(logo instanceof HTMLImageElement)) return Promise.resolve(null);
  return whenImageReady(logo).then(() => logo);
}

export function initHeroReveal() {
  const logoReady = whenHeroLogoDecoded();

  if (restartStaggerOnNextReveal) {
    restartStaggerOnNextReveal = false;
    void Promise.all([whenViewTransitionSettled(), logoReady]).then(
      ([, logo]) => {
        logo?.classList.add("is-decoded");
        restartEnterStaggerAuto();
      },
    );
  } else {
    void logoReady.then((logo) => logo?.classList.add("is-decoded"));
  }

  const img = document.querySelector(".hero-media .hero-image");
  const media = img?.closest(".hero-media");
  if (!img || !media) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const nav = performance.getEntriesByType("navigation")[0];
  const restored =
    reducedMotion ||
    nav?.type === "back_forward" ||
    document.documentElement.classList.contains("navigation-restore");

  let revealed = false;

  async function reveal({ animate = true } = {}) {
    if (revealed) return;
    revealed = true;
    await whenImageReady(img);
    if (animate) {
      // Commit opacity:0 before starting the transition.
      void img.offsetWidth;
    }
    img.classList.add("is-visible");
    media.classList.add("is-ready");
  }

  if (reducedMotion || restored) {
    // Already shown via navigation-restore CSS / settleAnimations. Do not
    // force a reflow or await decode — that restarts the fade and flickers.
    revealed = true;
    img.classList.add("is-visible");
    media.classList.add("is-ready");
    return;
  }

  const fallback = window.setTimeout(() => void reveal(), 2500);

  function done() {
    window.clearTimeout(fallback);
    requestAnimationFrame(() => void reveal());
  }

  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });

  if (img.complete) {
    done();
  }
}
