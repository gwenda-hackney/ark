const DEFAULT_PROJECT_ID = "pn5yjro6";
const API_VERSION = "2025-01-01";

export type SanityEvent = {
  title: string;
  description: string;
  date: string | null;
  heroImageUrl: string | null;
};

function sanityDataset(env: NodeJS.ProcessEnv): string {
  return env.SANITY_DATASET?.trim() || "development";
}

const EVENT_BY_SLUG_QUERY = `*[_type == "event" && slug.current == $slug][0]{
  title,
  description,
  date,
  "heroImageUrl": heroImage.asset->url
}`;

export async function fetchEventBySlug(
  env: NodeJS.ProcessEnv,
  slug: string,
): Promise<SanityEvent | null> {
  const normalized = slug.trim();
  if (!normalized) return null;

  const projectId = env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const dataset = sanityDataset(env);
  const token = env.SANITY_API_TOKEN?.trim();
  const host = token ? "api.sanity.io" : "apicdn.sanity.io";
  const url = new URL(`https://${projectId}.${host}/${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set("query", EVENT_BY_SLUG_QUERY);
  url.searchParams.set("$slug", JSON.stringify(normalized));

  const response = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { result?: SanityEvent };
  const doc = payload.result;
  if (!doc?.title) return null;

  return {
    title: doc.title,
    description: doc.description ?? "",
    date: doc.date ?? null,
    heroImageUrl: doc.heroImageUrl ?? null,
  };
}

export function resolveInviteImageUrl(
  env: NodeJS.ProcessEnv,
  event: SanityEvent | null,
): string {
  if (event?.heroImageUrl?.trim()) return event.heroImageUrl.trim();
  return (
    env.INVITE_IMAGE_URL?.trim() ||
    env.PUBLIC_INVITE_IMAGE_URL?.trim() ||
    "https://gwenda.co.uk/images/event-invite.jpg"
  );
}
