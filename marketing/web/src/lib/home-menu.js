/**
 * A taste of one menu for home (#240): the first chapter with anything on
 * it, a few of its items with their prices, then every other part of the
 * menu by name with what it starts from. Each leads to its own place on
 * the menu's page (lib/menu-anchors.js).
 */
import { menuAddresses } from "./menu-anchors.js";

function available(section) {
  return (section.items || []).filter((item) => item.available !== false);
}

function priceRows(item) {
  const listed = (item.prices || [])
    .map((row) => String(row.price || "").trim())
    .filter(Boolean);
  if (listed.length) return listed;
  return [item.price, item.priceAlt]
    .map((price) => String(price || "").trim())
    .filter(Boolean);
}

/** "9" → "£9", "3.5" → "£3.50"; "" for anything that isn't a price. */
export function poundPrice(price) {
  const amount = Number.parseFloat(String(price ?? "").replace(/[£,\s]/g, ""));
  if (!Number.isFinite(amount)) return "";
  return `£${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/** The cheapest price among the items, as "£4"; "" when none has a price. */
export function fromPrice(items) {
  const amounts = items
    .flatMap(priceRows)
    .map((price) => Number.parseFloat(price))
    .filter(Number.isFinite);
  return amounts.length ? poundPrice(Math.min(...amounts)) : "";
}

/**
 * @param {Array<{ id: string, kind?: string, title: string, items: object[], subsections?: object[] }>} chapters
 *   one menu's chapters as they were fetched, in the order ops sets them
 * @param {{ count?: number }} [options] how many of the first chapter's items to list
 * @returns {null | {
 *   lead: { href: string, title: string, total: number, items: Array<{ name: string, description: string, price: string }> },
 *   more: Array<{ href: string, title: string, from: string }>,
 * }} null when the menu has nothing on it yet. Each `href` is that part's
 *   own place on the menu's page.
 */
export function menuTaste(chapters, { count = 6 } = {}) {
  const where = menuAddresses(chapters);
  /**
   * Every part with items: a chapter's own, then each of its subsections.
   * A part with nothing on is left out, as it is on the menu's page.
   */
  const parts = chapters.flatMap((chapter) =>
    [chapter, ...(chapter.subsections || [])]
      .map((part) => ({
        href: where(part).href,
        title: part.title,
        items: available(part),
      }))
      .filter((part) => part.items.length > 0),
  );
  if (!parts.length) return null;

  const [first, ...rest] = parts;
  return {
    lead: {
      href: first.href,
      title: first.title,
      total: first.items.length,
      items: first.items.slice(0, count).map((item) => ({
        name: item.name,
        description: item.description || "",
        price: poundPrice(priceRows(item)[0]),
      })),
    },
    more: rest.map((part) => ({
      href: part.href,
      title: part.title,
      from: fromPrice(part.items),
    })),
  };
}
