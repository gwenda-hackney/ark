const DEFAULT_PROJECT_ID = "pn5yjro6";
const API_VERSION = "v2025-01-01";

export function sanityProjectId(env = {}) {
  return env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
}

export function sanityDataset(env = {}, target = "staging") {
  if (env.SANITY_DATASET?.trim()) return env.SANITY_DATASET.trim();
  return target === "production" ? "production" : "development";
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
    url.searchParams.set(key, JSON.stringify(value));
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
