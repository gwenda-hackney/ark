import type { MenuItemImage } from "./menu";

export type Event = {
  id: string;
  title: string;
  artist?: string;
  offer?: string;
  seriesId?: string;
  seriesTitle?: string;
  recurrence?: string;
  isSpecialEdition?: boolean;
  time?: string;
  startTime?: string;
  endTime?: string;
  /** ISO date — YYYY-MM-DD */
  date: string;
  /** Card blurb on What's on. */
  shortDescription?: string;
  description: string;
  heroImage?: MenuItemImage;
  /** Series Main image from ops, when published (already framed 16×10). */
  seriesHeroImageUrl?: string | null;
  seriesHeroObjectPosition?: string | null;
};

export type EventSeries = {
  seriesId: string;
  title: string;
  description: string;
  shortDescription?: string;
  recurrence?: string;
  schedule?: "manual" | "repeating";
  offer?: string;
  heroImageUrl?: string | null;
  heroObjectPosition?: string | null;
};
