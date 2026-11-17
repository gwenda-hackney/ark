/**
 * Bookings' words (#240, IV in the navigation): the page's heading and note,
 * and its two halves, having a party here and playing here, each with its
 * heading, its line, its button's words and its place on /bookings.
 *
 * The website (BookingHalves.astro, HomeBookings.astro, pages/bookings.astro)
 * and the weekly email (shared/weekly-email, #315) both read them from here,
 * so changing a word in config/site.ts changes it in both. What the email
 * counts on is pinned in bookings.email.contract.test.js.
 */
import { siteConfig } from "../config/site";

/** The Bookings page. */
export const BOOKINGS_PATH = "/bookings";

/**
 * @typedef {{
 *   id: "party" | "play",
 *   heading: string,
 *   line: string,
 *   cta: string,
 *   page: string,
 * }} BookingHalf
 */

/**
 * The page's heading and note, and its halves, the party first. Each half's
 * `id` is its anchor on the page, and `page` the address that lands on it:
 * "/bookings#party", "/bookings#play".
 * @returns {{ heading: string, note: string, halves: BookingHalf[] }}
 */
export function bookingsWords() {
  const { bookings: words, contactPage } = siteConfig.copy;
  return {
    heading: words.heading,
    note: words.note,
    halves: [
      {
        id: "party",
        heading: words.partyHeading,
        line: words.partyLine,
        cta: contactPage.partyCta,
        page: `${BOOKINGS_PATH}#party`,
      },
      {
        id: "play",
        heading: contactPage.playHeading,
        line: words.playLine,
        cta: contactPage.playCta,
        page: `${BOOKINGS_PATH}#play`,
      },
    ],
  };
}
