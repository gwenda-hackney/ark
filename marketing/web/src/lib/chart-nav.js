import { navPathname } from "./site-nav.js";

/** The chart's sections, in order, as numbered rings (#240). */
export const CHART_SECTIONS = [
  { numeral: "I", label: "Bar", href: "/menu" },
  { numeral: "II", label: "Galley", href: "/menu#kitchen" },
  { numeral: "III", label: "The log", href: "/whats-on" },
  { numeral: "IV", label: "The Articles", href: "/about" },
  { numeral: "V", label: "Find us", href: "/contact" },
];

/**
 * The sections with the current page marked. Two sections can share a page
 * (Bar and Galley are both the menu); the first one takes the mark.
 *
 * @param {string} [pathname]
 */
export function chartSections(pathname = "/") {
  const current = navPathname(pathname || "/");
  let marked = false;
  return CHART_SECTIONS.map((item) => {
    const isCurrent =
      !marked && Boolean(current) && navPathname(item.href) === current;
    if (isCurrent) marked = true;
    return { ...item, current: isCurrent };
  });
}
