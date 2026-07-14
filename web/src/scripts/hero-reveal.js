/**
 * Fade in the hero background once its <img> has usable pixels.
 * Handles preload/cache races where `load` never fires after `complete`.
 */
import { whenImageReady } from "./entrance-motion.js";

export function initHeroReveal() {
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

  async function reveal() {
    if (revealed) return;
    revealed = true;
    await whenImageReady(img);
    // Commit opacity:0 before starting the transition.
    void img.offsetWidth;
    img.classList.add("is-visible");
    media.classList.add("is-ready");
  }

  if (reducedMotion || restored) {
    void reveal();
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
