import type { MenuItemImage } from "./menu";

export type Event = {
  id: string;
  title: string;
  /** ISO date — YYYY-MM-DD */
  date: string;
  description: string;
  heroImage?: MenuItemImage;
};
