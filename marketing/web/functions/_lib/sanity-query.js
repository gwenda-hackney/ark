const DEFAULT_PROJECT_ID = "pn5yjro6";
const API_VERSION = "v2025-01-01";

/** Each environment has one dataset; the preview is its drafts. */
export function sanityDatasetForEnv(env = {}) {
  return env.SANITY_DATASET?.trim() || "production";
}

/**
 * The live site shows published documents; the preview site and a local dev
 * server show drafts over them. Deploys set SANITY_PERSPECTIVE explicitly.
 */
export function sanityPerspectiveForEnv(env = {}) {
  const explicit = env.SANITY_PERSPECTIVE?.trim();
  if (explicit === "published" || explicit === "previewDrafts") return explicit;
  const siteEnv = env.SITE_ENV?.trim();
  if (siteEnv === "preview" || siteEnv === "local" || siteEnv === "development") {
    return "previewDrafts";
  }
  return "published";
}

export function sanityProjectId(env = {}) {
  return env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
}

/** Query Sanity — uses api.sanity.io when SANITY_API_TOKEN is set (private datasets). */
export async function sanityQuery(env, query, params = {}) {
  const projectId = sanityProjectId(env);
  const dataset = sanityDatasetForEnv(env);
  const token = env.SANITY_API_TOKEN?.trim();
  const host = token ? "api.sanity.io" : "apicdn.sanity.io";
  const url = new URL(`https://${projectId}.${host}/${API_VERSION}/data/query/${dataset}`);
  url.searchParams.set("query", query);
  url.searchParams.set("perspective", sanityPerspectiveForEnv(env));
  for (const [key, value] of Object.entries(params)) {
    // Sanity requires GROQ params as `$name` query-string keys.
    const paramKey = key.startsWith("$") ? key : `$${key}`;
    url.searchParams.set(paramKey, JSON.stringify(value));
  }

  const response = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) return null;

  const payload = await response.json();
  return payload?.result ?? null;
}
