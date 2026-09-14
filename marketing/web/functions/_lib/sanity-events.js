import { sanityQuery } from "./sanity-query.js";
import { portableTextToPlain } from "./portable-text.js";

const EVENTS_LIST_QUERY = `*[_type == "event" && coalesce(eventType, "public") == "public"] | order(date asc) {
  "id": slug.current,
  title,
  date,
  description,
  "heroImageUrl": heroImage.asset->url
}`;

export async function fetchPublishedEvents(env) {
  const rows = (await sanityQuery(env, EVENTS_LIST_QUERY)) ?? [];

  return rows
    .filter((row) => row?.id && row?.title && row?.date && row?.description)
    .map((row) => ({
      id: row.id,
      title: row.title,
      date: row.date,
      description: portableTextToPlain(row.description),
      heroImageUrl: row.heroImageUrl ?? null,
    }));
}
