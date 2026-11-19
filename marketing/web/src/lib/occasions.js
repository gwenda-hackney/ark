/**
 * Occasions on the website (#353): something on sale for a while that leads
 * to an enquiry (Christmas parties), set up in ops (What's on → Occasions) and
 * put in the Sanity document `occasions`. Home shows a card for each one whose
 * show days include today; the page is built ahead of time, so the browser
 * shows and hides them on the visitor's day (scripts/occasion-cards.js).
 */

/** Every occasion, with its picture's address and size. */
export const OCCASIONS_QUERY = `*[_id == "occasions"][0].items[]{
  name, line, included, covers, showFrom, showUntil,
  "image": image{ alt, "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height }
}`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (value) => String(value ?? "").trim();

/**
 * The occasions as the page uses them: named, with real show days; anything
 * else is left out. `included` is a list, blanks gone.
 *
 * @param {unknown} raw what OCCASIONS_QUERY returns
 * @returns {Array<{ name: string, line: string, included: string[], covers: string,
 *   showFrom: string, showUntil: string, image: { url: string, alt: string, width: number, height: number } | null }>}
 */
export function readOccasions(raw) {
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
export function occasionShowing(occasion, todayIso) {
  return occasion.showFrom <= todayIso && todayIso <= occasion.showUntil;
}

/** The ones home may still show: not over by `todayIso`, soonest first. */
export function occasionsToCome(occasions, todayIso) {
  return occasions
    .filter((occasion) => occasion.showUntil >= todayIso)
    .sort((a, b) => a.showFrom.localeCompare(b.showFrom));
}

/** The party form, marked with the occasion (form-submit.js EXTRA_ANSWERS). */
export function occasionEnquiryHref(name, formPath = "/contact/party") {
  return `${formPath}?occasion=${encodeURIComponent(name)}`;
}
