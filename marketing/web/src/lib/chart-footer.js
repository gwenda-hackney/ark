/**
 * What the foot of every page says (#240, ChartFooter.astro) beyond the
 * opening hours and the sign-up: the places the navigation doesn't carry,
 * a map, the phone.
 */
import { PLAY_FORM_SLUG, formPublicPath } from "./form-paths";

/**
 * The foot's own places, in its line of small print: the navigation
 * (chart-nav.js CHART_SECTIONS) carries the rest.
 */
export const FOOT_LINKS = [
  { label: "Photos", href: "/photos" },
  { label: "Play here", href: formPublicPath(PLAY_FORM_SLUG) },
  { label: "About", href: "/about" },
];

/** The small print, last in that line, after Instagram. */
export const PRIVACY_LINK = { label: "Privacy", href: "/privacy" };

/**
 * The record on the trail over the small print: the way back up to the top
 * of the page, to its main, which every page with the foot has (as Skip to
 * content does).
 */
export const BACK_TO_TOP = { href: "#main", label: "Back to top" };

/** Google Maps, searching for the place by its name and address. */
export function mapsSearchUrl({ name, address }) {
  const query = [name, address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** "+44 20 4637 4754" → "tel:+442046374754". */
export function phoneHref(telephone) {
  return `tel:${String(telephone).replace(/[^\d+]/g, "")}`;
}

/** "+44 20 4637 4754" → "020 4637 4754", as it's dialled in London. */
export function phoneText(telephone) {
  return String(telephone)
    .trim()
    .replace(/^\+44\s*/, "0");
}
