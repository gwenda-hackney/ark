import { createSanityClient } from "./client";
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
};

export type RsvpEventPage = {
  slug: string;
  title: string;
  date: string;
  seriesId: string;
  description: string;
};

function mapRsvpEventPage(doc: SanityRsvpEvent): RsvpEventPage | null {
  const slug = doc.slug?.trim();
  const description = portableTextToPlain(doc.description);
  const date = String(doc.date || "").trim();
  if (!slug || !doc.title?.trim() || !description || !date) return null;

  return {
    slug,
    title: doc.title.trim(),
    date,
    seriesId: String(doc.seriesId || "").trim() || slug,
    description,
  };
}

/** Published events, for the legacy /events/<slug> redirects. */
export async function fetchRsvpEventPages(): Promise<RsvpEventPage[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityRsvpEvent[]>(RSVP_EVENTS_QUERY);

  return docs
    .map(mapRsvpEventPage)
    .filter((event): event is RsvpEventPage => event !== null);
}
