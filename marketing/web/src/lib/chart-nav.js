import { PARTY_FORM_SLUG, formPublicPath } from "./form-paths";
import { navPathname } from "./site-nav.js";

/**
 * Where people want to go, numbered, in order (#240). One list feeds every
 * navigation: the numbered links on home's hero, the bar across the top of
 * the other pages on a desk screen, the panel behind the menu button, and
 * the ring by each page's title. Photos, About and the list are in the foot
 * of every page; playing here is a part of Contact.
 *
 * `home` is the id of the place's own section on home (each links on to its
 * page): home's links go there, down the page, instead of to the page. A
 * place without one (Contact) goes to its page from home too.
 */
export const CHART_SECTIONS = [
  { numeral: "I", label: "What's on", href: "/whats-on", home: "whats-on" },
  { numeral: "II", label: "Drinks", href: "/bar", home: "drinks" },
  { numeral: "III", label: "Food", href: "/kitchen", home: "food" },
  {
    numeral: "IV",
    label: "Parties",
    href: formPublicPath(PARTY_FORM_SLUG),
    home: "party",
  },
  { numeral: "V", label: "Contact", href: "/contact" },
];

/**
 * The sections, with the one this page is in marked. A page is in the
 * section whose path is its own or the nearest above it: an event under
 * What's on, the play form under Contact, the party form's "sent" page under
 * Parties. `ariaCurrent` is "page" on the section's own page and "true" on a
 * page inside it. A page outside all five (home, Photos, About) marks none.
 *
 * @param {string} [pathname]
 */
export function chartSections(pathname = "/") {
  const path = navPathname(pathname || "/");
  const depth = (href) => {
    const own = navPathname(href);
    if (path === own) return Infinity;
    return path.startsWith(`${own}/`) ? own.length : -1;
  };
  const deepest = Math.max(...CHART_SECTIONS.map((item) => depth(item.href)));
  const section =
    deepest < 0
      ? null
      : CHART_SECTIONS.find((item) => depth(item.href) === deepest);
  return CHART_SECTIONS.map((item) => {
    const current = item === section;
    return {
      ...item,
      current,
      ariaCurrent: current
        ? deepest === Infinity
          ? "page"
          : "true"
        : undefined,
    };
  });
}
