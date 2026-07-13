const DEFAULT_PROJECT_ID = "pn5yjro6";

const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug][0]{
  title,
  description,
  date,
  "heroImageUrl": heroImage.asset->url
}`;

export function sanityDatasetForEnv(env = {}) {
  if (env.SANITY_DATASET?.trim()) return env.SANITY_DATASET.trim();
  if (env.SITE_ENV === "staging") return "development";
  return "production";
}

export async function fetchEventBySlug(env, slug) {
  const normalized = slug?.trim();
  if (!normalized) return null;

  const projectId = env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const dataset = sanityDatasetForEnv(env);
  const url = new URL(
    `https://${projectId}.apicdn.sanity.io/v2025-01-01/data/query/${dataset}`,
  );
  url.searchParams.set("query", EVENT_BY_SLUG_QUERY);
  url.searchParams.set("$slug", JSON.stringify(normalized));

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const payload = await response.json();
  const doc = payload?.result;
  if (!doc?.title) return null;

  return {
    title: doc.title,
    description: doc.description ?? "",
    date: doc.date ?? null,
    heroImageUrl: doc.heroImageUrl ?? null,
  };
}
