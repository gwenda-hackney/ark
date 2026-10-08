import { navPathname } from "./site-nav.js";

/** The chart's sections, in order, as numbered rings (#240). */
export const CHART_SECTIONS = [
  { numeral: "I", label: "Bar", href: "/bar" },
  { numeral: "II", label: "Kitchen", href: "/kitchen" },
  { numeral: "III", label: "What's on", href: "/whats-on" },
  { numeral: "IV", label: "Play here", href: "/contact/play" },
  { numeral: "V", label: "About", href: "/about" },
  { numeral: "VI", label: "Contact", href: "/contact" },
];

/**
 * The sections with the current page marked.
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
