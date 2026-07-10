import type { Event } from "../../types/events";
import { createSanityClient } from "./client";
import { EVENTS_QUERY } from "./queries";

type SanityEvent = {
  id: string | null;
  title: string;
  date: string;
  description: string;
};

function mapEvent(doc: SanityEvent): Event | null {
  if (!doc.id || !doc.title || !doc.date || !doc.description) {
    return null;
  }

  return {
    id: doc.id,
    title: doc.title,
    date: doc.date,
    description: doc.description,
  };
}

export async function fetchEvents(): Promise<Event[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityEvent[]>(EVENTS_QUERY);

  return docs
    .map(mapEvent)
    .filter((event): event is Event => event !== null);
}
