import type { MenuItemImage } from "./menu";

/** A night, a promotion (a standing deal) or a pop-up kitchen: set in ops. */
export type EventCategory = "event" | "promotion" | "popup";

export type Event = {
  id: string;
  title: string;
  artist?: string;
  offer?: string;
  /** Their page, when they provided one. */
  pageUrl?: string;
  seriesId?: string;
  seriesTitle?: string;
  /** What its series is; What's on shows nights ("event") only. */
  category?: EventCategory;
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
  category?: EventCategory;
  description: string;
  shortDescription?: string;
  recurrence?: string;
  replacesSeriesId?: string;
  /** Old web addresses, set in ops, that redirect to this series. */
  formerSlugs?: string[];
  schedule?: "manual" | "repeating" | "once";
  /** No nights yet: What's on shows "Check back soon for the next date". */
  datesPending?: boolean;
  /**
   * The series' gallery from ops (its Images tab), newest first: on its own
   * page, and on /photos (lib/photo-sources.ts).
   */
  gallery?: Array<{
    url: string;
    width: number;
    height: number;
    alt?: string | null;
    /** A night's photo: YYYY-MM-DD. */
    date?: string | null;
    /** When it was uploaded. */
    added?: string | null;
    lqip?: string | null;
    color?: string | null;
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
