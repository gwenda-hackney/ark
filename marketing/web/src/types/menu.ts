export type MenuItemImage = {
  url: string;
  width: number;
  height: number;
  alt?: string;
  /** CSS object-position for gallery tiles — from Sanity hotspot. */
  objectPosition?: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  /** Display price, e.g. "14" */
  price?: string;
  tags?: string[];
  available?: boolean;
  /** Sanity CDN image — required for homepage gallery. */
  image?: MenuItemImage;
  /** Style or serve — e.g. Floral fizz, Digestif. */
  notes?: string;
  /** Featured in the homepage signature cocktail gallery. */
  signature?: boolean;
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
