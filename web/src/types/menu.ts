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
  /** Style or serve — e.g. Aperitif, Digestif. */
  notes?: string;
  /** Featured in the homepage signature cocktail gallery. */
  signature?: boolean;
};

export type MenuSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
};

export type Menu = {
  sections: MenuSection[];
};
