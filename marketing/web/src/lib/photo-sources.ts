/**
 * Where the gallery's photos come from. The only module that knows.
 *
 * - The venue's own: files in src/assets/images/, listed in
 *   src/data/photos.json (add one with `npm run gallery:add`).
 * - Each event's: its gallery in ops (the event's Images tab), published to
 *   Sanity with the series and read here when the site is built. A change in
 *   ops starts a build of its own once edits go quiet (ops site-pending.js).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ImageMetadata } from "astro";
import list from "../data/photos.json";
import { listPhotos } from "./photos.js";
import { londonToday } from "./london-day.js";
import { kitchenNow } from "./popup-kitchen.js";
import { upcomingNights } from "./promotions.js";
import { fetchWhatsOnCatalog } from "./sanity/events";
import type { EventSeries } from "../types/events";

const modules = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/images/**/*.{jpg,jpeg,png,webp}",
  { eager: true },
);

const files: Record<string, ImageMetadata> = Object.fromEntries(
  Object.entries(modules).map(([path, module]) => [
    path.replace("../assets/images/", ""),
    module.default,
  ]),
);

/**
 * The SHA-1 of a venue photo's bytes. Sanity names an upload by the same
 * hash, so the same picture added to an event in ops is known for the same
 * one and shown once. The build runs in marketing/web.
 */
function fileHash(file: string): string {
  try {
    return createHash("sha1")
      .update(readFileSync(resolve("src/assets/images", file)))
      .digest("hex");
  } catch {
    return "";
  }
}

export type GalleryPhoto = {
  file: string;
  alt: string;
  link: string;
  /** The menu board on home it can be pinned up on: "drinks", "food" or "". */
  menu: string;
  image: ImageMetadata;
  ratio: number;
  hash: string;
};

/** Every venue photo, newest first. */
export function galleryPhotos(): GalleryPhoto[] {
  return (listPhotos(list, files) as Omit<GalleryPhoto, "hash">[]).map(
    (photo) => ({ ...photo, hash: fileHash(photo.file) }),
  );
}

/** A photo from an event's gallery in ops, on Sanity's CDN. */
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

function eventPhoto(entry: GalleryEntry): EventPhoto {
  const url = String(entry?.url || "").trim();
  return {
    url,
    width: Number(entry?.width) || 0,
    height: Number(entry?.height) || 0,
    alt: String(entry?.alt || "").trim(),
    date: String(entry?.date || "").trim(),
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
