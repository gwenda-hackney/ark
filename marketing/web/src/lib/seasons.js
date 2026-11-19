/**
 * Seasons on the website (#353): something on sale for a while that leads
 * to an enquiry (Christmas parties), set up in ops (What's on → Seasons) and
 * put in the Sanity document `seasons`. Home shows a card for each one whose
 * show days include today; the page is built ahead of time, so the browser
 * shows and hides them on the visitor's day (scripts/season-cards.js).
 */

/** Every season, with its picture's address and size. */
export const SEASONS_QUERY = `*[_id == "seasons"][0].items[]{
  name, line, included, covers, showFrom, showUntil,
  "image": image{ alt, "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height }
}`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (value) => String(value ?? "").trim();

/**
 * The seasons as the page uses them: named, with real show days; anything
 * else is left out. `included` is a list, blanks gone.
 *
 * @param {unknown} raw what SEASONS_QUERY returns
 * @returns {Array<{ name: string, line: string, included: string[], covers: string,
 *   showFrom: string, showUntil: string, image: { url: string, alt: string, width: number, height: number } | null }>}
 */
export function readSeasons(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      name: text(item?.name),
      line: text(item?.line),
      included: (Array.isArray(item?.included) ? item.included : [])
        .map(text)
        .filter(Boolean),
      covers: text(item?.covers),
      showFrom: text(item?.showFrom),
      showUntil: text(item?.showUntil),
      image: item?.image?.url
        ? {
            url: String(item.image.url),
            alt: text(item.image.alt),
            width: Number(item.image.width) || 0,
            height: Number(item.image.height) || 0,
          }
        : null,
    }))
    .filter(
      (item) =>
        item.name &&
        DAY.test(item.showFrom) &&
        DAY.test(item.showUntil) &&
        item.showFrom <= item.showUntil,
    );
}

/** True when home shows it today: its first day to its last, both included. */
export function seasonShowing(season, todayIso) {
  return season.showFrom <= todayIso && todayIso <= season.showUntil;
}

/** The ones home may still show: not over by `todayIso`, soonest first. */
export function seasonsToCome(seasons, todayIso) {
  return seasons
    .filter((season) => season.showUntil >= todayIso)
    .sort((a, b) => a.showFrom.localeCompare(b.showFrom));
}

/** The party form, marked with the season (form-submit.js EXTRA_ANSWERS). */
export function seasonEnquiryHref(name, formPath = "/contact/party") {
  return `${formPath}?season=${encodeURIComponent(name)}`;
}
