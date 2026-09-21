const DEFAULT_PROJECT_ID = "pn5yjro6";
const API_VERSION = "v2025-01-01";

export function sanityProjectId(env = {}) {
  return env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
}

/** Dataset ops may write. Production is clone-only. */
export const EDITORIAL_DATASET = "staging";

export function sanityDataset(env = {}, target = "staging") {
  if (target === "production") return "production";
  return EDITORIAL_DATASET;
}

function assertEditorialDataset(dataset) {
  if (dataset !== EDITORIAL_DATASET) {
    const error = new Error(
      "Ops can only write the staging dataset. Production is updated by clone.",
    );
    error.status = 400;
    throw error;
  }
}

function headers(token, extra = {}) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export async function sanityQuery(env, dataset, query, params = {}) {
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = new URL(
    `https://${projectId}.api.sanity.io/${API_VERSION}/data/query/${dataset}`,
  );
  url.searchParams.set("query", query);
  for (const [key, value] of Object.entries(params)) {
    // Sanity requires GROQ params as `$name` query-string keys.
    const paramKey = key.startsWith("$") ? key : `$${key}`;
    url.searchParams.set(paramKey, JSON.stringify(value));
  }
  const response = await fetch(url.toString(), { headers: headers(token) });
  if (!response.ok) {
    const error = new Error(`Sanity query failed (${response.status}).`);
    error.status = 502;
    throw error;
  }
  const payload = await response.json();
  return payload?.result ?? null;
}

export async function sanityMutate(env, dataset, mutations) {
  assertEditorialDataset(dataset);
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = `https://${projectId}.api.sanity.io/${API_VERSION}/data/mutate/${dataset}?returnIds=true`;
  const response = await fetch(url, {
    method: "POST",
    headers: headers(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ mutations }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error?.description || payload.message || `Sanity mutate failed (${response.status}).`,
    );
    error.status = 502;
    throw error;
  }
  return payload;
}

export async function sanityUploadImage(env, dataset, bytes, { filename, contentType }) {
  assertEditorialDataset(dataset);
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = new URL(
    `https://${projectId}.api.sanity.io/${API_VERSION}/assets/images/${dataset}`,
  );
  if (filename) url.searchParams.set("filename", filename);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: headers(token, {
      "Content-Type": contentType || "application/octet-stream",
    }),
    body: bytes,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `Image upload failed (${response.status}).`);
    error.status = 502;
    throw error;
  }
  return payload?.document ?? null;
}
