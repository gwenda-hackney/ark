/**
 * Keep the URL hash in sync with the section currently in view while scrolling.
 * Anchor clicks still work natively; we use replaceState so history isn't
 * flooded with every scroll position.
 */

/** @param {string | null | undefined} sectionId */
export function buildSectionUrl(sectionId) {
  const base = `${location.pathname}${location.search}`;
  if (!sectionId || sectionId === "hero") return base;
  return `${base}#${sectionId}`;
}

/** @param {Map<string, number>} ratios */
export function pickActiveSection(ratios) {
  let bestId = null;
  let bestRatio = 0;

  for (const [id, ratio] of ratios) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestId = id;
    }
  }

  return bestRatio > 0 ? bestId : null;
}

function syncHash(sectionId) {
  const nextUrl = buildSectionUrl(sectionId);
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;

  if (nextUrl === currentUrl) return;

  history.replaceState(null, "", nextUrl);
}

/**
 * @param {object} [options]
 * @param {() => void} [options.onSectionChange]
 */
export function initSectionHash(options = {}) {
  const hero = document.getElementById("hero");
  if (!hero) return () => {};

  const sections = [...document.querySelectorAll("main section[id]")].filter(
    (section) => section.id,
  );
  if (sections.length === 0) return () => {};

  /** @type {Map<string, number>} */
  const ratios = new Map();
  let activeId = null;
  let clickLockUntil = 0;

  const applyActiveSection = (sectionId) => {
    if (!sectionId || sectionId === activeId) return;
    activeId = sectionId;
    syncHash(sectionId);
    options.onSectionChange?.(sectionId);
  };

  const updateFromRatios = () => {
    if (Date.now() < clickLockUntil) return;
    applyActiveSection(pickActiveSection(ratios));
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        ratios.set(entry.target.id, entry.intersectionRatio);
      }
      updateFromRatios();
    },
    {
      root: null,
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    },
  );

  for (const section of sections) {
    ratios.set(section.id, 0);
    observer.observe(section);
  }

  const onAnchorClick = (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href") ?? "";
    if (!hash.startsWith("#") || hash.length < 2) return;

    const sectionId = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(sectionId);
    if (!target) return;

    // Drive scroll in JS so it stays smooth after back/forward restore
    // (CSS scroll-behavior is locked to auto until restore settles), and so
    // clicking the same hash again still animates.
    event.preventDefault();
    clickLockUntil = Date.now() + 900;
    activeId = sectionId;
    syncHash(sectionId);

    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "start",
    });
  };

  document.addEventListener("click", onAnchorClick, true);
  updateFromRatios();

  return () => {
    observer.disconnect();
    document.removeEventListener("click", onAnchorClick, true);
  };
}
