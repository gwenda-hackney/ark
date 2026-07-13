import { sanityDatasetForEnv } from "./sanity-event.js";

const DEFAULT_PROJECT_ID = "pn5yjro6";

const EVENTS_LIST_QUERY = `*[_type == "event"] | order(date asc) {
  "id": slug.current,
  title,
  date,
  description,
  "heroImageUrl": heroImage.asset->url
}`;

export async function fetchPublishedEvents(env) {
  const projectId = env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const dataset = sanityDatasetForEnv(env);
  const url = new URL(
    `https://${projectId}.apicdn.sanity.io/v2025-01-01/data/query/${dataset}`,
  );
  url.searchParams.set("query", EVENTS_LIST_QUERY);

  const response = await fetch(url.toString());
  if (!response.ok) return [];

  const payload = await response.json();
  const rows = payload?.result ?? [];

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
