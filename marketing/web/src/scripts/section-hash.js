/**
 * Homepage in-page anchors: always smooth-scroll via JS so clicks work after
 * back/forward (CSS scroll-behavior stays auto during restore) and when the
 * URL hash already matches the target.
 *
 * Do not sync the hash while scrolling. replaceState during restore fights the
 * browser's scroll restoration and causes visible flicker.
 */

import { replacePageUrl } from "./history-state.js";

/** @param {string | null | undefined} sectionId */
export function buildSectionUrl(sectionId) {
  const base = `${location.pathname}${location.search}`;
  if (!sectionId || sectionId === "hero") return base;
  return `${base}#${sectionId}`;
}

function syncHash(sectionId) {
  const nextUrl = buildSectionUrl(sectionId);
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;

  if (nextUrl === currentUrl) return;

  replacePageUrl(nextUrl);
}

/**
 * The old home's only (Hero.astro, /preview). The new look's pages
 * (`.ch-page`, #240) leave their jumps to the router, so each is a step Back
 * undoes: taking them here made Back after home's Skip to content or Back to
 * top leave the site.
 *
 * @param {object} [options]
 * @param {(sectionId: string) => void} [options.onSectionChange]
 */
export function initSectionHash(options = {}) {
  const hero = document.getElementById("hero");
  if (!hero || document.querySelector(".ch-page")) return () => {};

  const onAnchorClick = (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href") ?? "";
    if (!hash.startsWith("#") || hash.length < 2) return;

    const sectionId = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(sectionId);
    if (!target) return;

    event.preventDefault();
    syncHash(sectionId);
    options.onSectionChange?.(sectionId);

    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "start",
    });
  };

  document.addEventListener("click", onAnchorClick, true);

  return () => {
    document.removeEventListener("click", onAnchorClick, true);
  };
}
