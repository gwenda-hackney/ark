/**
 * Where the gallery's photos come from. The only module that knows.
 *
 * - The venue's own: the Gallery in ops (#291), published to Sanity with the
 *   venue's details (the `venueDetails` document, lib/venue-details.js) and
 *   read here when the site is built, in the Gallery's order. Each photo's
 *   size is its Sanity asset's.
 * - Each event's: its gallery in ops (the event's Images tab), published to
 *   Sanity with the series and read here when the site is built.
 *
 * Either way a change in ops starts a build of its own once edits go quiet
 * (ops site-pending.js).
 */
import { londonToday } from "./london-day.js";
import { PHOTO_MENUS } from "./photos.js";
import { kitchenNow } from "./popup-kitchen.js";
import { upcomingNights } from "./promotions.js";
import { fetchWhatsOnCatalog } from "./sanity/events";
import {
  fetchVenueDetails,
  type VenueGalleryEntry,
} from "./sanity/venue-details";
import type { EventSeries } from "../types/events";

/** A photo from a gallery in ops, on Sanity's CDN. */
export type EventPhoto = {
  url: string;
  width: number;
  height: number;
  alt: string;
  /** A night's photo: YYYY-MM-DD. */
  date: string;
  added: string;
  lqip: string;
  color: string;
  hash: string;
};

/** A photo of the venue's own, from its Gallery in ops. */
export type GalleryPhoto = EventPhoto & {
  /** The menu board on home it can be pinned up on: "drinks", "food" or "". */
  menu: string;
  /** Width over height, to three places: the wall lays photos out by it. */
  ratio: number;
};

/** An event and its photos, newest first; `href` while it has a page. */
export type EventPhotoSet = {
  id: string;
  title: string;
  href: string;
  photos: EventPhoto[];
};

type GalleryEntry = NonNullable<EventSeries["gallery"]>[number];

/** Sanity's address for an upload ends in the hash of its bytes. */
const SANITY_HASH = /\/([0-9a-f]{40})-\d+x\d+\.[a-z]+(?:[?#]|$)/;

/** Said for a venue photo ops hasn't described yet. */
const VENUE_PHOTO_ALT = "A photo from Gwenda";

function eventPhoto(entry: GalleryEntry | VenueGalleryEntry): EventPhoto {
  const url = String(entry?.url || "").trim();
  return {
    url,
    width: Number(entry?.width) || 0,
    height: Number(entry?.height) || 0,
    alt: String(entry?.alt || "").trim(),
    date: String((entry as GalleryEntry)?.date || "").trim(),
    added: String(entry?.added || "").trim(),
    lqip: /^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/.test(entry?.lqip || "")
      ? String(entry?.lqip)
      : "",
    color: /^#[0-9a-f]{3,8}$/i.test(entry?.color || "")
      ? String(entry?.color)
      : "",
    hash: SANITY_HASH.exec(url)?.[1] || "",
  };
}

/**
 * The venue's Gallery as Sanity has it → the photos the pages show, in its
 * order (the first is first on home). One with no picture to show (no
 * address or size) is left out rather than breaking the page; the same
 * picture twice shows once.
 */
export function venuePhotos(
  entries: VenueGalleryEntry[] | null | undefined,
): GalleryPhoto[] {
  const seen = new Set<string>();
  const photos: GalleryPhoto[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const photo = eventPhoto(entry);
    if (!photo.url || !(photo.width > 0) || !(photo.height > 0)) continue;
    const key = photo.hash || photo.url;
    if (seen.has(key)) continue;
    seen.add(key);
    const menu = String(entry?.menu || "");
    photos.push({
      ...photo,
      alt: photo.alt || VENUE_PHOTO_ALT,
      menu: PHOTO_MENUS.includes(menu) ? menu : "",
      ratio: Math.round((photo.width / photo.height) * 1000) / 1000,
    });
  }
  return photos;
}

/** Every venue photo, in the Gallery's order. */
export async function galleryPhotos(): Promise<GalleryPhoto[]> {
  return venuePhotos((await fetchVenueDetails()).gallery);
}

/**
 * Every event's photos, and the pop-up kitchen's from when it's booked
 * through its last night (lib/popup-kitchen.js kitchenNow: the same test as
 * its chapter of the menu), for the Food board. An event links to its page only while it has
 * one: a night to come, or dates on the way. A series taken off in ops
 * isn't here at all.
 *
 * @param today YYYY-MM-DD, the build's day at the bar unless a test pins it
 */
export async function eventPhotos(today = londonToday()): Promise<{
  events: EventPhotoSet[];
  kitchen: EventPhotoSet | null;
}> {
  const { series, occurrences } = await fetchWhatsOnCatalog().catch(() => ({
    series: [] as EventSeries[],
    occurrences: [],
  }));
  const events = series.map((row) => ({
    id: row.seriesId,
    title: row.title,
    href:
      upcomingNights(row.seriesId, occurrences, today).length ||
      row.datesPending
        ? `/whats-on/${encodeURIComponent(row.seriesId)}/`
        : "",
    photos: (row.gallery || []).map(eventPhoto).filter((photo) => photo.url),
  }));
  const { popup } = kitchenNow(series, occurrences, today);
  return {
    events,
    kitchen: events.find((event) => event.id === popup?.id) || null,
  };
}
