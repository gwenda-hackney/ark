import type { Event, EventSeries } from "../../types/events";
import { createSanityClient } from "./client";
import {
  mapSanityHeroImage,
  mapSanityImage,
  type SanityImageField,
} from "./images";
import { portableTextToPlain } from "./portable-text";
import { EVENTS_QUERY, SERIES_QUERY } from "./queries";

type PortableTextBlock = {
  _type?: string;
  children?: Array<{ text?: string }>;
};

type SanityEvent = {
  id: string | null;
  title: string;
  artist?: string | null;
  offer?: string | null;
  pageUrl?: string | null;
  seriesId?: string | null;
  seriesTitle?: string | null;
  recurrence?: string | null;
  isSpecialEdition?: boolean | null;
  time?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  date: string;
  shortDescription?: string | null;
  nightSchedule?: Array<{
    label?: string | null;
    startTime?: string | null;
    endTime?: string | null;
  }> | null;
  description: string | PortableTextBlock[];
  heroImage?: SanityImageField;
  seriesHeroImage?: SanityImageField;
};

function mapNightSchedule(
  value: SanityEvent["nightSchedule"],
): Event["nightSchedule"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((slot) => ({
      label: String(slot?.label || "").trim(),
      startTime: String(slot?.startTime || "").trim(),
      endTime: String(slot?.endTime || "").trim(),
    }))
    .filter((slot) => slot.label);
}

function mapEvent(doc: SanityEvent): Event | null {
  const description = portableTextToPlain(doc.description);
  if (!doc.id || !doc.title || !doc.date || !description) {
    return null;
  }

  const seriesHero = mapSanityHeroImage(doc.seriesHeroImage, doc.title);
  const hero = mapSanityHeroImage(doc.heroImage, doc.title);

  return {
    id: doc.id,
    title: doc.title,
    artist: doc.artist?.trim() || "",
    offer: doc.offer?.trim() || "",
    pageUrl: doc.pageUrl?.trim() || "",
    seriesId: doc.seriesId?.trim() || doc.id,
    seriesTitle: doc.seriesTitle?.trim() || "",
    recurrence: doc.recurrence?.trim() || "",
    isSpecialEdition: Boolean(doc.isSpecialEdition),
    time: doc.time?.trim() || "",
    startTime: doc.startTime?.trim() || "",
    endTime: doc.endTime?.trim() || "",
    date: doc.date,
    shortDescription: doc.shortDescription?.trim() || "",
    nightSchedule: mapNightSchedule(doc.nightSchedule),
    description,
    heroImage: hero || mapSanityImage(doc.heroImage, doc.title),
    seriesHeroImageUrl: seriesHero?.url || null,
    seriesHeroObjectPosition: seriesHero?.objectPosition || null,
  };
}

export async function fetchEvents(): Promise<Event[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityEvent[]>(EVENTS_QUERY);

  return docs.map(mapEvent).filter((event): event is Event => event !== null);
}

type SanitySeries = {
  id: string | null;
  title: string;
  schedule?: string | null;
  recurrence?: string | null;
  replacesSeriesId?: string | null;
  datesPending?: boolean | null;
  shortDescription?: string | null;
  nightSchedule?: SanityEvent["nightSchedule"];
  description?: string | PortableTextBlock[] | null;
  heroImage?: SanityImageField;
};

function mapSeries(doc: SanitySeries): EventSeries | null {
  if (!doc.id || !doc.title) return null;
  const hero = mapSanityHeroImage(doc.heroImage, doc.title);
  return {
    seriesId: doc.id,
    title: doc.title,
    schedule:
      doc.schedule === "repeating"
        ? "repeating"
        : doc.schedule === "once"
          ? "once"
          : "manual",
    replacesSeriesId: String(doc.replacesSeriesId || "").trim(),
    datesPending: doc.datesPending === true,
    recurrence: doc.recurrence?.trim() || "",
    shortDescription: doc.shortDescription?.trim() || "",
    nightSchedule: mapNightSchedule(doc.nightSchedule),
    description: portableTextToPlain(doc.description || ""),
    heroImageUrl: hero?.url || null,
    heroObjectPosition: hero?.objectPosition || null,
  };
}

export async function fetchSeries(): Promise<EventSeries[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanitySeries[]>(SERIES_QUERY);
  return docs.map(mapSeries).filter((row): row is EventSeries => row !== null);
}

export async function fetchWhatsOnCatalog(): Promise<{
  series: EventSeries[];
  occurrences: Event[];
}> {
  const [series, occurrences] = await Promise.all([
    fetchSeries(),
    fetchEvents(),
  ]);
  return { series, occurrences };
}
