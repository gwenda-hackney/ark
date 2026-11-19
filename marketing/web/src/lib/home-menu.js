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

/** The most a board lists from each part after its first, when it has room for them: a few of each, then on to the next. */
export const EXTRA_PER_PART = 3;

/**
 * @param {Array<{ id: string, kind?: string, title: string, items: object[], subsections?: object[] }>} chapters
 *   one menu's chapters as they were fetched, in the order ops sets them
 * @param {{ count?: number, lead?: number, where?: ReturnType<typeof menuAddresses> }} [options]
 *   how many items to list, and the menu page's addresses when it has
 *   several menus (lib/menus.js menuShelf). `lead`: the most of those from
 *   the first chapter; the rest come from the parts after it, in the
 *   menu's order, up to EXTRA_PER_PART from each (`extra`), so the
 *   list keeps about its length however many the first chapter has.
 * @returns {null | {
 *   lead: { href: string, title: string, total: number, items: Array<{ name: string, description: string, price: string }> },
 *   extra: Array<{ href: string, title: string, total: number, items: Array<{ name: string, description: string, price: string }> }>,
 *   more: Array<{ href: string, title: string, from: string }>,
 * }} null when the menu has nothing on it yet. `lead` is the first chapter's
 *   first part with anything on (its own items, else its first group's);
 *   `extra` the parts after it listed too (none unless `lead` leaves room);
 *   `more` the tiles for the rest. Each `href` is that section's own place on the menu's page.
 */
export function menuTaste(
  chapters,
  {
    count = HOME_MENU_ITEMS,
    lead: leadMax,
    where = menuAddresses(chapters),
  } = {},
) {
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
  const listed = (items, n) =>
    items.slice(0, n).map((item) => ({
      name: item.name,
      description: item.description || "",
      price: poundPrice(priceRows(item)[0]),
    }));
  /** What comes after the first part: every other chapter, else its own groups. */
  const after = others.length
    ? others.map(({ chapter, parts }) => ({
        href: where(chapter).href,
        title: chapter.title,
        items: parts.flatMap((part) => part.items),
      }))
    : groups;
  const leadItems = listed(first.items, Math.min(count, leadMax ?? count));
  /** Room left once the first part is listed, filled from the parts after it in turn: only when asked (`lead`). */
  let room = leadMax === undefined ? 0 : count - leadItems.length;
  const extra = [];
  for (const part of after) {
    if (room <= 0) break;
    const items = listed(part.items, Math.min(room, EXTRA_PER_PART));
    extra.push({
      href: part.href,
      title: part.title,
      total: part.items.length,
      items,
    });
    room -= items.length;
  }
  return {
    lead: {
      href: first.href,
      title: first.title,
      total: first.items.length,
      items: leadItems,
    },
    extra,
    more: after.slice(extra.length).map(tile),
  };
}
