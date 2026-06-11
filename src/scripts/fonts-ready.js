/** Reveal text once webfonts are usable — avoids fallback-to-brand font swap. */
export function initFontsReady() {
  if (document.documentElement.classList.contains("fonts-ready")) return;

  const markReady = () => {
    document.documentElement.classList.add("fonts-ready");
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    markReady();
    return;
  }

  Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]).then(markReady);
}
