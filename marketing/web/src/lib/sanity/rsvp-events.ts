import { createSanityClient } from "./client";
import { mapSanitySocialPreviewImage, type SanityImageField } from "./images";
import { portableTextToPlain } from "./portable-text";
import { RSVP_EVENTS_QUERY } from "./queries";

type PortableTextBlock = {
  _type?: string;
  children?: Array<{ text?: string }>;
};

type SanityRsvpEvent = {
  slug: string | null;
  title: string;
  date?: string | null;
  seriesId?: string | null;
  description: string | PortableTextBlock[];
  heroImage?: SanityImageField;
};

export type RsvpEventPage = {
  slug: string;
  title: string;
  date: string;
  seriesId: string;
  description: string;
  socialImage?: {
    url: string;
    width: number;
    height: number;
    alt: string;
    type: string;
    /** Self-hosted path under /og/events/, written at build time. */
    publicPath: string;
  };
};

function mapRsvpEventPage(doc: SanityRsvpEvent): RsvpEventPage | null {
  const slug = doc.slug?.trim();
  const description = portableTextToPlain(doc.description);
  const date = String(doc.date || "").trim();
  if (!slug || !doc.title?.trim() || !description || !date) return null;

  const socialImage = mapSanitySocialPreviewImage(doc.heroImage, doc.title);

  return {
    slug,
    title: doc.title.trim(),
    date,
    seriesId: String(doc.seriesId || "").trim() || slug,
    description,
    socialImage: socialImage
      ? {
          url: socialImage.url,
          width: socialImage.width,
          height: socialImage.height,
          alt: socialImage.alt || doc.title,
          type: socialImage.type,
          publicPath: `/og/events/${slug}.jpg`,
        }
      : undefined,
  };
}

/** Published events for RSVP static paths and per-event social previews. */
export async function fetchRsvpEventPages(): Promise<RsvpEventPage[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityRsvpEvent[]>(RSVP_EVENTS_QUERY);

  return docs
    .map(mapRsvpEventPage)
    .filter((event): event is RsvpEventPage => event !== null);
}

/** Trim plain text for meta descriptions without cutting mid-word. */
export function socialDescription(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.6) {
    return `${clipped.slice(0, lastSpace).trim()}…`;
  }

  return `${clipped.trim()}…`;
}
