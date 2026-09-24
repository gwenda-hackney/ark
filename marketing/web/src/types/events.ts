import type { MenuItemImage } from "./menu";

export type Event = {
  id: string;
  title: string;
  artist?: string;
  offer?: string;
  /** Their page, when they provided one. */
  pageUrl?: string;
  seriesId?: string;
  seriesTitle?: string;
  recurrence?: string;
  isSpecialEdition?: boolean;
  time?: string;
  startTime?: string;
  endTime?: string;
  /** Structured night slots (open decks, chess, sets). */
  nightSchedule?: Array<{
    label: string;
    startTime?: string;
    endTime?: string;
  }>;
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
  replacesSeriesId?: string;
  schedule?: "manual" | "repeating" | "once";
  offer?: string;
  nightSchedule?: Array<{
    label: string;
    startTime?: string;
    endTime?: string;
  }>;
  heroImageUrl?: string | null;
  heroObjectPosition?: string | null;
};
