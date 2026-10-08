export type MenuItemImage = {
  url: string;
  width: number;
  height: number;
  alt?: string;
  /** CSS object-position for gallery tiles — from Sanity hotspot. */
  objectPosition?: string;
};

export type DrinkType = "cocktail" | "pour" | "beer" | "packaged";

/** One size and what it costs, e.g. { name: "175 ml", price: "9" }. */
export type MenuPrice = {
  name: string;
  size?: string;
  price: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  /** Primary price (single / pint / unit), e.g. "14" */
  price?: string;
  /** Second size (double / half pint). */
  priceAlt?: string;
  /** Every price, main one first. Drinks published before it have only price / priceAlt. */
  prices?: MenuPrice[];
  drinkType?: DrinkType;
  tags?: string[];
  available?: boolean;
  /** Sanity CDN image — required for homepage gallery. */
  image?: MenuItemImage;
  /** Tasting note — e.g. Floral fizz, Digestif. */
  notes?: string;
  /** Optional bottle metadata (beer / wine). */
  abv?: string;
  volume?: string;
  producer?: string;
};

export type MenuKind = "bar" | "kitchen";

export type MenuSection = {
  id: string;
  title: string;
  subtitle?: string;
  /** Which menu a chapter belongs to; subsections follow their parent. */
  kind?: MenuKind;
  items: MenuItem[];
  /** Nested groups under a chapter (e.g. Spritz under By the Book). */
  subsections?: MenuSection[];
};

export type Menu = {
  sections: MenuSection[];
};

/** The drink's prices: its list when it has one, else the two old fields. */
export function menuPrices(item: MenuItem): MenuPrice[] {
  const listed = (item.prices || []).filter((row) => row.price?.trim());
  if (listed.length) return listed;
  return [item.price, item.priceAlt]
    .map((price) => price?.trim() || "")
    .filter(Boolean)
    .map((price) => ({ name: "", price }));
}

/**
 * Guest / grid display without currency symbol (CSS adds £): "14" or
 * "14 / 18" beside the name. Three or more sizes need their names, so they
 * go on their own line (menuPriceList) and this is blank.
 */
export function formatMenuPrice(item: MenuItem): string {
  const rows = menuPrices(item);
  if (rows.length > 2) return "";
  return rows.map((row) => row.price.trim()).join(" / ");
}

/** Three or more sizes, each with its name: 125 ml 7 · 175 ml 9 · Bottle 32. */
export function menuPriceList(item: MenuItem): MenuPrice[] {
  const rows = menuPrices(item);
  return rows.length > 2 ? rows : [];
}
