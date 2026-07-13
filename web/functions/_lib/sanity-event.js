import { sanityDatasetForEnv, sanityProjectId, sanityQuery } from "./sanity-query.js";

const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug][0]{
  title,
  description,
  date,
  "heroImageUrl": heroImage.asset->url
}`;

export { sanityDatasetForEnv };

export async function fetchEventBySlug(env, slug) {
  const normalized = slug?.trim();
  if (!normalized) return null;

  const doc = await sanityQuery(env, EVENT_BY_SLUG_QUERY, { $slug: normalized });
  if (!doc?.title) return null;

  return {
    title: doc.title,
    description: doc.description ?? "",
    date: doc.date ?? null,
    heroImageUrl: doc.heroImageUrl ?? null,
  };
}

export async function fetchEventHeroImageUrl(env, slug) {
  const event = await fetchEventBySlug(env, slug);
  if (event?.heroImageUrl) return event.heroImageUrl;
  return env.INVITE_IMAGE_URL?.trim() || "https://gwenda.co.uk/images/event-invite.jpg";
}
