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

/** Wait until `html.fonts-ready` (or timeout) before starting stagger animations. */
export function whenFontsReady() {
  if (document.documentElement.classList.contains("fonts-ready")) {
    return Promise.resolve();
  }

  initFontsReady();

  return new Promise((resolve) => {
    const finish = () => resolve();

    if (document.documentElement.classList.contains("fonts-ready")) {
      finish();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.documentElement.classList.contains("fonts-ready")) return;
      observer.disconnect();
      finish();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.setTimeout(() => {
      observer.disconnect();
      finish();
    }, 2500);
  });
}
