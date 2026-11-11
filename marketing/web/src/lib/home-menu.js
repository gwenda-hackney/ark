/**
 * A taste of one menu for home (#240): the first chapter with anything on
 * it, a few of its items with their prices, then the rest of the menu one
 * level up, by name with what it starts from: every other chapter, in the
 * menu's order; or, when that first chapter is all there is, its other
 * groups. Each leads to its own place on the menu's page
 * (lib/menu-anchors.js). Names and order are the menu's own (ops).
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
 * How many things each board lists from its first chapter, in the menu's
 * order: the same on both, so drinks and food line up (food's first group,
 * the burgers, has three). The rest are "and N more".
 */
export const HOME_MENU_ITEMS = 3;

/**
 * @param {Array<{ id: string, kind?: string, title: string, items: object[], subsections?: object[] }>} chapters
 *   one menu's chapters as they were fetched, in the order ops sets them
 * @param {{ count?: number }} [options] how many of the first chapter's items to list
 * @returns {null | {
 *   lead: { href: string, title: string, total: number, items: Array<{ name: string, description: string, price: string }> },
 *   more: Array<{ href: string, title: string, from: string }>,
 * }} null when the menu has nothing on it yet. `lead` is the first chapter's
 *   first part with anything on (its own items, else its first group's);
 *   `more` the tiles. Each `href` is that section's own place on the menu's page.
 */
export function menuTaste(chapters, { count = HOME_MENU_ITEMS } = {}) {
  const where = menuAddresses(chapters);
  /**
   * Each chapter's parts with items: its own, then each of its groups. A
   * part with nothing on is left out, as it is on the menu's page, and so is
   * a chapter with no such part.
   */
  const filled = chapters
    .map((chapter) => ({
      chapter,
      parts: [chapter, ...(chapter.subsections || [])]
        .map((part) => ({
          href: where(part).href,
          title: part.title,
          items: available(part),
        }))
        .filter((part) => part.items.length > 0),
    }))
    .filter(({ parts }) => parts.length > 0);
  if (!filled.length) return null;

  const [lead, ...others] = filled;
  const [first, ...groups] = lead.parts;
  const tile = (part) => ({
    href: part.href,
    title: part.title,
    from: fromPrice(part.items),
  });
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
    more: others.length
      ? others.map(({ chapter, parts }) =>
          tile({
            href: where(chapter).href,
            title: chapter.title,
            items: parts.flatMap((part) => part.items),
          }),
        )
      : groups.map(tile),
  };
}
