import { whenFontsReady } from "./fonts-ready.js";

/** Skip entrance motion on reduced motion or back/forward restore. */
export function shouldSkipEntranceMotion() {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("navigation-restore")
  );
}

function forceReflow(element) {
  if (element instanceof Element) void element.offsetWidth;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/** Wait for an image to finish loading/decoding before starting opacity animation. */
export function whenImageReady(img) {
  if (!(img instanceof HTMLImageElement)) return Promise.resolve();

  if (img.complete) {
    return typeof img.decode === "function"
      ? img.decode().catch(() => undefined)
      : Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

export function whenImagesReady(root) {
  if (!(root instanceof Element)) return Promise.resolve();
  return Promise.all([...root.querySelectorAll("img")].map(whenImageReady));
}

/**
 * Reveal a scene after fonts and images are ready — same contract as the hero.
 * Scene motion is transform-only; stagger children handle opacity via CSS.
 */
export async function revealEnterScene(scene, { decodeImages = true } = {}) {
  if (!(scene instanceof HTMLElement)) return;

  if (shouldSkipEntranceMotion()) {
    scene.classList.add("is-visible");
    return;
  }

  await whenFontsReady();
  if (decodeImages) await whenImagesReady(scene);

  await nextFrame();
  await nextFrame();
  forceReflow(scene);
  scene.classList.add("is-visible");
}

/** Fade an element out before swapping page state (loaders, overlays). */
export function fadeOutElement(element, { timeoutMs = 500 } = {}) {
  return new Promise((resolve) => {
    if (!(element instanceof HTMLElement) || element.hidden) {
      resolve();
      return;
    }

    if (shouldSkipEntranceMotion()) {
      element.hidden = true;
      resolve();
      return;
    }

    element.classList.add("is-leaving");
    const finish = () => {
      element.hidden = true;
      element.classList.remove("is-leaving");
      resolve();
    };

    element.addEventListener(
      "transitionend",
      (event) => {
        if (event.propertyName === "opacity") finish();
      },
      { once: true },
    );
    window.setTimeout(finish, timeoutMs);
  });
}
