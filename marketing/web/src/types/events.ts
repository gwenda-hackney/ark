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
  /** Old web addresses, set in ops, that redirect to this series. */
  formerSlugs?: string[];
  schedule?: "manual" | "repeating" | "once";
  /** No nights yet: What's on shows "Check back soon for the next date". */
  datesPending?: boolean;
  /** Photos from the series' Drive gallery, copied by ops. */
  gallery?: Array<{
    url: string;
    width: number;
    height: number;
    alt?: string | null;
  }>;
  offer?: string;
  nightSchedule?: Array<{
    label: string;
    startTime?: string;
    endTime?: string;
  }>;
  heroImageUrl?: string | null;
  heroObjectPosition?: string | null;
};
