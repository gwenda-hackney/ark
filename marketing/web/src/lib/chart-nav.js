import { navPathname } from "./site-nav.js";

/**
 * The site's sections as numbered rings, in order (#240): what's on, the
 * two menus, and Contact, which holds finding us, playing here and the
 * list. About is in the foot of every page.
 */
export const CHART_SECTIONS = [
  { numeral: "I", label: "What's on", href: "/whats-on" },
  { numeral: "II", label: "Drinks", href: "/bar" },
  { numeral: "III", label: "Food", href: "/kitchen" },
  { numeral: "IV", label: "Contact", href: "/contact" },
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
