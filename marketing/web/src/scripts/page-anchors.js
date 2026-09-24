/**
 * In-page menu targets. Resolved on each scroll so a rebuilt list
 * (the What's on diary) still moves the underline.
 *
 * @param {ParentNode} nav
 * @returns {{ id: string, el: HTMLElement }[]}
 */
export function pageAnchorSections(nav) {
  /** @type {{ id: string, el: HTMLElement }[]} */
  const sections = [];
  for (const link of nav.querySelectorAll(
    ".site-nav-group--page a[href^='#']",
  )) {
    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith("#") || href.length < 2) continue;
    const id = decodeURIComponent(href.slice(1));
    const el = document.getElementById(id);
    if (!(el instanceof HTMLElement) || !el.isConnected) continue;
    sections.push({ id, el });
  }
  return sections;
}

/**
 * The last anchor whose top has reached the bar. Nothing is current
 * before the first one arrives. Detached nodes are ignored.
 * At the end of the page, a later heading already on screen counts too,
 * so the last group can become current when it cannot scroll up to the bar.
 *
 * @param {{ id: string, el: HTMLElement }[]} sections
 * @param {number} line
 * @param {{ atEnd?: boolean, viewportHeight?: number }} [options]
 * @returns {string | null}
 */
export function currentPageAnchorId(
  sections,
  line,
  { atEnd = false, viewportHeight = Infinity } = {},
) {
  let currentId = null;
  for (const section of sections) {
    if (!section.el.isConnected) continue;
    const top = section.el.getBoundingClientRect().top;
    if (top <= line) currentId = section.id;
    else if (atEnd && top < viewportHeight) currentId = section.id;
  }
  return currentId;
}
