/**
 * Menu page chapter TOC: smooth-scroll jumps + scroll-spy active state.
 */

import { replacePageUrl } from "./history-state.js";

/**
 * @param {string | null | undefined} sectionId
 */
export function buildMenuSectionUrl(sectionId) {
  const base = `${location.pathname}${location.search}`;
  if (!sectionId) return base;
  return `${base}#${sectionId}`;
}

/**
 * @param {string} sectionId
 */
function syncHash(sectionId) {
  const nextUrl = buildMenuSectionUrl(sectionId);
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  if (nextUrl === currentUrl) return;
  replacePageUrl(nextUrl);
}

/**
 * @returns {() => void}
 */
export function initMenuToc() {
  const toc = document.querySelector("[data-menu-toc]");
  if (!toc) return () => {};

  const links = [...toc.querySelectorAll("a.menu-toc-link[href^='#']")];
  /** @type {{ id: string, el: HTMLElement, link: HTMLAnchorElement }[]} */
  const sections = [];

  for (const link of links) {
    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith("#") || href.length < 2) continue;
    const id = decodeURIComponent(href.slice(1));
    const el = document.getElementById(id);
    if (!el) continue;
    sections.push({ id, el, link });
  }

  if (sections.length === 0) return () => {};

  /** @param {string} id */
  function setActive(id) {
    for (const section of sections) {
      const active = section.id === id;
      section.link.classList.toggle("is-active", active);
      if (active) section.link.setAttribute("aria-current", "true");
      else section.link.removeAttribute("aria-current");
    }
  }

  const hashId = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (hashId && sections.some((s) => s.id === hashId)) {
    setActive(hashId);
  } else {
    setActive(sections[0].id);
  }

  const onClick = (event) => {
    const link = event.target.closest("a.menu-toc-link[href^='#']");
    if (!link || !toc.contains(link)) return;

    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith("#") || href.length < 2) return;

    const sectionId = decodeURIComponent(href.slice(1));
    const target = document.getElementById(sectionId);
    if (!target) return;

    event.preventDefault();
    syncHash(sectionId);
    setActive(sectionId);

    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: prefersReduced ? "auto" : "smooth",
      block: "start",
    });
  };

  toc.addEventListener("click", onClick);

  /** @type {string | null} */
  let activeId = null;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      const next = visible[0]?.target.id;
      if (!next || next === activeId) return;
      activeId = next;
      setActive(next);
    },
    {
      // Band near the top of the viewport (below sticky TOC).
      rootMargin: "-18% 0px -72% 0px",
      threshold: 0,
    },
  );

  for (const section of sections) {
    observer.observe(section.el);
  }

  return () => {
    toc.removeEventListener("click", onClick);
    observer.disconnect();
  };
}
