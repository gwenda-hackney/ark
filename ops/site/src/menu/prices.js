/**
 * A drink's prices: any number of rows, each a name, an optional size, a price
 * and an optional till SKU. Drinks saved before the table have two fixed
 * slots (Price / Alt price and their SKUs). Those slots stay filled from the
 * first two rows, so everything that reads them keeps working, and a drink
 * with no rows yet gets them from the slots.
 *
 * Plain JS so the Pages Functions and the browser share it.
 */

/** UK pint. Half pint is half of this. */
export const UK_PINT_ML = 568;
/** Standard single spirit / wine pour. Double is twice this. */
export const SINGLE_POUR_ML = 25;

/** @typedef {{ name: string; size?: string; price: string; sku?: string }} PriceRow */
/** @typedef {"cocktail" | "pour" | "beer" | "packaged" | "postmix"} PriceDrinkType */

/** @param {unknown} value @returns {PriceDrinkType} */
function drinkKind(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged" || raw === "postmix") return raw;
  return "cocktail";
}

/**
 * The first two rows' default names: Single and Double, Pint and Half pint,
 * or just Price for packaged drinks.
 * @param {unknown} type
 * @returns {{ primary: string; alt?: string }}
 */
export function priceLabels(type) {
  switch (drinkKind(type)) {
    case "beer":
    case "postmix":
      return { primary: "Pint", alt: "Half pint" };
    case "packaged":
      return { primary: "Price" };
    default:
      return { primary: "Single", alt: "Double" };
  }
}

/**
 * Sizes for the first two rows, from the house serves: 25 ml and 50 ml for a
 * pour, a pint and a half for draught. Cocktails and packaged have none.
 * @param {unknown} type
 * @returns {{ primary?: string; alt?: string }}
 */
export function defaultPriceSizes(type) {
  switch (drinkKind(type)) {
    case "pour":
      return { primary: `${SINGLE_POUR_ML} ml`, alt: `${SINGLE_POUR_ML * 2} ml` };
    case "beer":
    case "postmix":
      return { primary: "Pint", alt: "Half pint" };
    default:
      return {};
  }
}

/** @param {unknown} value */
function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

/** "£8.50" → "8.50": stored like the old Price column, without the sign. */
function cleanPrice(value) {
  return clean(value).replace(/^£\s*/, "");
}

/**
 * One row, tidied. Blank size and SKU are left off.
 * @param {unknown} raw
 * @returns {PriceRow | null}
 */
export function cleanPriceRow(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const out = /** @type {PriceRow} */ ({ name: clean(row.name), price: cleanPrice(row.price) });
  const size = clean(row.size);
  const sku = clean(row.sku);
  if (size) out.size = size;
  if (sku) out.sku = sku;
  return out;
}

/**
 * Rows from the Prices column (JSON text) or an array. Anything unreadable
 * reads as no rows; a row with nothing in it is dropped.
 * @param {unknown} raw
 * @returns {PriceRow[]}
 */
export function parsePriceRows(raw) {
  let list = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map(cleanPriceRow)
    .filter((row) => row != null && Boolean(row.name || row.price || row.size || row.sku));
}

/**
 * @typedef {{
 *   drinkType?: unknown;
 *   prices?: unknown;
 *   price?: unknown;
 *   priceAlt?: unknown;
 *   lightspeedSku?: unknown;
 *   lightspeedSkuAlt?: unknown;
 * }} PricedItem
 */

/**
 * Rows from the two old slots, named and sized for the drink type. Always
 * at least the main row (its price may be blank).
 * @param {PricedItem | null | undefined} item
 * @returns {PriceRow[]}
 */
export function pricesFromLegacy(item) {
  const labels = priceLabels(item?.drinkType);
  const sizes = defaultPriceSizes(item?.drinkType);
  const main = cleanPriceRow({
    name: labels.primary,
    size: sizes.primary,
    price: item?.price,
    sku: item?.lightspeedSku,
  });
  const rows = /** @type {PriceRow[]} */ ([main]);
  if (cleanPrice(item?.priceAlt)) {
    const alt = cleanPriceRow({
      name: labels.alt || "Price 2",
      size: sizes.alt,
      price: item?.priceAlt,
      sku: item?.lightspeedSkuAlt,
    });
    if (alt) rows.push(alt);
  }
  return rows.filter((row) => row != null);
}

/**
 * The drink's rows: its own when it has any, else from the old slots. A row
 * being typed into keeps its place even while it is blank.
 * @param {PricedItem | null | undefined} item
 * @returns {PriceRow[]}
 */
export function normalizePrices(item) {
  const rows = Array.isArray(item?.prices)
    ? item.prices.map(cleanPriceRow).filter((row) => row != null)
    : parsePriceRows(item?.prices);
  return rows.length ? rows : pricesFromLegacy(item);
}

/**
 * Stored rows with the old slots laid over the first two. The slots are
 * written with every save, but the till match writes SKUs straight into
 * them, and an older client may send only `price`, so where a slot has a
 * value it wins. A second-size price with no second row adds one.
 * @param {PricedItem | null | undefined} item
 * @returns {PriceRow[]}
 */
export function mergeLegacyPrices(item) {
  const stored = parsePriceRows(item?.prices);
  if (!stored.length) return pricesFromLegacy(item);
  const rows = stored.map((row) => ({ ...row }));
  const price = cleanPrice(item?.price);
  const sku = clean(item?.lightspeedSku);
  const priceAlt = cleanPrice(item?.priceAlt);
  const skuAlt = clean(item?.lightspeedSkuAlt);
  if (price) rows[0].price = price;
  if (sku) rows[0].sku = sku;
  if (priceAlt && !rows[1]) {
    const derived = pricesFromLegacy({ ...item, prices: undefined });
    rows.push(derived[1]);
  } else if (rows[1]) {
    if (priceAlt) rows[1].price = priceAlt;
    if (skuAlt) rows[1].sku = skuAlt;
  }
  return rows;
}

/**
 * The old slots, filled from the first two rows.
 * @param {PriceRow[]} rows
 */
export function mirrorPrices(rows) {
  return {
    price: rows[0]?.price || "",
    priceAlt: rows[1]?.price || "",
    lightspeedSku: rows[0]?.sku || "",
    lightspeedSkuAlt: rows[1]?.sku || "",
  };
}

/**
 * The item with these rows and its old slots kept in step.
 * @template {object} T
 * @param {T} item
 * @param {PriceRow[]} rows
 * @returns {T & { prices: PriceRow[]; price: string; priceAlt: string; lightspeedSku: string; lightspeedSkuAlt: string }}
 */
export function withPrices(item, rows) {
  return { ...item, prices: rows, ...mirrorPrices(rows) };
}

/** For the Prices column. @param {PriceRow[]} rows */
export function serializePrices(rows) {
  return JSON.stringify(parsePriceRows(rows));
}

/**
 * Name for a new row: Double after Single, Half pint after Pint, otherwise
 * Price N (the next number not taken).
 * @param {PriceRow[]} rows
 * @param {unknown} type
 */
export function nextPriceName(rows, type) {
  const taken = new Set(rows.map((row) => clean(row.name).toLowerCase()));
  const labels = priceLabels(type);
  const pairs = [
    ["single", "Double"],
    ["pint", "Half pint"],
  ];
  if (labels.alt) pairs.unshift([labels.primary.toLowerCase(), labels.alt]);
  for (const [first, next] of pairs) {
    if (taken.has(first) && !taken.has(next.toLowerCase())) return next;
  }
  let n = rows.length + 1;
  while (taken.has(`price ${n}`)) n += 1;
  return `Price ${n}`;
}

/**
 * The row Add price appends: the next name, sized like the house second
 * serve when it is one (a pour's Double is 50 ml), price left blank.
 * @param {PriceRow[]} rows
 * @param {unknown} type
 * @returns {PriceRow}
 */
export function newPriceRow(rows, type) {
  const name = nextPriceName(rows, type);
  const alt = priceLabels(type).alt;
  const size = alt && name === alt ? defaultPriceSizes(type).alt : undefined;
  return size ? { name, size, price: "" } : { name, price: "" };
}

/**
 * Rows still carrying the old drink type's default name or size take the new
 * type's (Single → Pint when a pour becomes a beer). Anything typed stays.
 * @param {PriceRow[]} rows
 * @param {unknown} from
 * @param {unknown} to
 * @returns {PriceRow[]}
 */
export function relabelPrices(rows, from, to) {
  const before = priceLabels(from);
  const after = priceLabels(to);
  const beforeSizes = defaultPriceSizes(from);
  const afterSizes = defaultPriceSizes(to);
  return rows.map((row, index) => {
    if (index > 1) return row;
    const key = index === 0 ? "primary" : "alt";
    const next = { ...row };
    if (before[key] && after[key] && row.name === before[key]) next.name = after[key];
    if ((row.size || "") === (beforeSizes[key] || "")) {
      if (afterSizes[key]) next.size = afterSizes[key];
      else delete next.size;
    }
    return next;
  });
}

/**
 * Millilitres in a size, when it says: "25 ml", "2.5cl", "1 L", "Pint",
 * "Half pint". Anything else (Bottle, Large) is null.
 * @param {unknown} size
 * @returns {number | null}
 */
export function parseSizeMl(size) {
  const text = clean(size).toLowerCase().replace(",", ".");
  if (!text) return null;
  if (/^(?:a\s+)?pint$/.test(text)) return UK_PINT_ML;
  if (/^(?:half|½)(?:\s*(?:a\s+)?pint)?$/.test(text)) return UK_PINT_ML / 2;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(ml|cl|l|litres?|liters?)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = match[2];
  if (unit === "ml") return n;
  if (unit === "cl") return Math.round(n * 10 * 10) / 10;
  return n * 1000;
}

/**
 * The prices on one line: "£12" for one, "£8 single · £10 double" for more.
 * Rows without a price are left out.
 * @param {PriceRow[]} rows
 */
export function formatPriceSummary(rows) {
  const priced = rows.filter((row) => clean(row.price));
  if (!priced.length) return "";
  if (priced.length === 1 && rows.length === 1) return `£${priced[0].price}`;
  return priced
    .map((row) => {
      const name = clean(row.name).toLowerCase();
      return name ? `£${row.price} ${name}` : `£${row.price}`;
    })
    .join(" · ");
}
