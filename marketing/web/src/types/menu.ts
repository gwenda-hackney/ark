export type MenuItemImage = {
  url: string;
  width: number;
  height: number;
  alt?: string;
  /** CSS object-position for gallery tiles — from Sanity hotspot. */
  objectPosition?: string;
};

export type DrinkType = "cocktail" | "pour" | "beer" | "packaged";

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  /** Primary price (single / pint / unit), e.g. "14" */
  price?: string;
  /** Second size (double / half pint). */
  priceAlt?: string;
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

export type MenuSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
  /** Nested groups under a chapter (e.g. Spritz under By the Book). */
  subsections?: MenuSection[];
};

export type Menu = {
  sections: MenuSection[];
};

/** Guest / grid display without currency symbol (CSS adds £). */
export function formatMenuPrice(item: MenuItem): string {
  const primary = item.price?.trim();
  const alt = item.priceAlt?.trim();
  if (primary && alt) return `${primary} / ${alt}`;
  return primary || alt || "";
}
