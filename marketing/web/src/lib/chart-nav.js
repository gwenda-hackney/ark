import { PARTY_FORM_SLUG, PLAY_FORM_SLUG, formPublicPath } from "./form-paths";
import { navPathname } from "./site-nav.js";

/**
 * Where people want to go, numbered, in order (#240). One list feeds every
 * navigation: the numbered links on home's hero, the bar across the top of
 * the other pages on a desk screen, the panel behind the menu button, and
 * the ring by each page's title. Photos, About and the list are in the foot
 * of every page. One job per place: having a party and playing here are
 * Bookings; Contact is finding us, the phone, the email and the list.
 *
 * `home` is the id of the place's own section on home (each links on to its
 * page): home's links go there, down the page, instead of to the page. A
 * place without one (Contact) goes to its page from home too.
 *
 * Every place has its own page, its `href`. Bookings' page (/bookings) has
 * the same two halves as its section on home, having a party and playing
 * here (BookingHalves.astro); a table is booked on OpenTable, from the
 * button on every page. `pages` names any other of the site's pages that
 * are in a place: the party and play forms are in Bookings, though their
 * addresses are under Contact's (/contact/party, /contact/play).
 */
export const CHART_SECTIONS = [
  { numeral: "I", label: "What's on", href: "/whats-on", home: "whats-on" },
  { numeral: "II", label: "Drinks", href: "/bar", home: "drinks" },
  { numeral: "III", label: "Food", href: "/kitchen", home: "food" },
  {
    numeral: "IV",
    label: "Bookings",
    href: "/bookings",
    home: "bookings",
    pages: [formPublicPath(PARTY_FORM_SLUG), formPublicPath(PLAY_FORM_SLUG)],
  },
  { numeral: "V", label: "Contact", href: "/contact" },
];

/** The site's pages a place takes in: its own, and any others in `pages`. */
const pagesOf = (item) => [item.href, ...(item.pages ?? [])];

/**
 * The sections, with the one this page is in marked. A page is in the
 * section whose page is this one or the nearest above it: an event under
 * What's on, the party and play forms and their "sent" pages under
 * Bookings, any other form under Contact. `ariaCurrent` is "page" when the
 * section's link is to this very page, and "true" on any other page in it.
 * A page outside all five (home, Photos, About) marks none.
 *
 * @param {string} [pathname]
 */
export function chartSections(pathname = "/") {
  const path = navPathname(pathname || "/");
  const depthOf = (href) => {
    const own = navPathname(href);
    if (path === own) return Infinity;
    return path.startsWith(`${own}/`) ? own.length : -1;
  };
  const depth = (item) => Math.max(...pagesOf(item).map(depthOf));
  const deepest = Math.max(...CHART_SECTIONS.map(depth));
  const section =
    deepest < 0 ? null : CHART_SECTIONS.find((item) => depth(item) === deepest);
  return CHART_SECTIONS.map((item) => {
    const current = item === section;
    return {
      ...item,
      current,
      ariaCurrent: current
        ? navPathname(item.href) === path
          ? "page"
          : "true"
        : undefined,
    };
  });
}
