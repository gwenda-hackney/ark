import type { ImageMetadata } from "astro";

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  /** Display price, e.g. "14" (rendered as £14) */
  price?: string;
  tags?: string[];
  available?: boolean;
  image?: ImageMetadata;
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
