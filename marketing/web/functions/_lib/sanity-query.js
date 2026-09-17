const DEFAULT_PROJECT_ID = "pn5yjro6";
const API_VERSION = "v2025-01-01";

export function sanityDatasetForEnv(env = {}) {
  if (env.SANITY_DATASET?.trim()) return env.SANITY_DATASET.trim();
  if (env.SITE_ENV === "staging") return "development";
  return "production";
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
