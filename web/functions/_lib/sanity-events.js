import { sanityQuery } from "./sanity-query.js";

const EVENTS_LIST_QUERY = `*[_type == "event"] | order(date asc) {
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
      description: row.description,
      heroImageUrl: row.heroImageUrl ?? null,
    }));
}
