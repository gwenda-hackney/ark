import { environmentOf, isLocalMachine } from "../../../../shared/config.js";

/** The real website's project. */
export const REAL_SANITY_PROJECT_ID = "pn5yjro6";
/** Free copy for local work, same two datasets (docs/sanity.md). */
export const DEV_SANITY_PROJECT_ID = "gwscpagy";
const DEFAULT_PROJECT_ID = REAL_SANITY_PROJECT_ID;
const API_VERSION = "v2025-01-01";

export function sanityProjectId(env = {}) {
  return env.SANITY_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
}

/** True when this runtime talks to the Gwenda Dev copy, not the real website. */
export function usesDevSanity(env = {}) {
  return sanityProjectId(env) !== REAL_SANITY_PROJECT_ID;
}

/** Dataset ops may write. Production is clone-only. */
export const EDITORIAL_DATASET = "staging";

export function sanityDataset(env = {}, target = "staging") {
  if (target === "production") return "production";
  return EDITORIAL_DATASET;
}

/** The dev environment (hosted or a developer's machine): dev Ops DB, Gwenda Dev Sanity. */
export function isLocalOps(env = {}) {
  return environmentOf(env) === "dev";
}

/** Ops on a developer's machine (npm run ops:dev), not hosted dev ops. */
export function runsOnMachine(env = {}) {
  return isLocalMachine(env);
}

/** For things that only exist hosted (GitHub builds, database copies). */
export function assertNotLocal(env, message = "Local ops cannot change the live site.") {
  if (!runsOnMachine(env)) return;
  const error = new Error(message);
  error.status = 403;
  throw error;
}

/**
 * Local ops saves and updates the website exactly like hosted ops, but only
 * ever in the Gwenda Dev project. Pointed at the real project, it refuses.
 */
export function assertSanityWritable(env) {
  if (!isLocalOps(env) || usesDevSanity(env)) return;
  const error = new Error(
    `Local ops only writes the Gwenda Dev Sanity project (SANITY_PROJECT_ID=${DEV_SANITY_PROJECT_ID}). Run it with npm run ops:dev.`,
  );
  error.status = 403;
  throw error;
}

/** "Update website" and "take it off the website" work here. */
export function canChangeWebsite(env) {
  return !isLocalOps(env) || usesDevSanity(env);
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
  assertSanityWritable(env);
  if (!mutations.length) return { results: [] };
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

export async function sanityUploadImage(env, dataset, bytes, meta) {
  return sanityUploadAsset(env, dataset, "images", bytes, meta);
}

/** Upload an image or file asset to the staging dataset. */
export async function sanityUploadAsset(env, dataset, kind, bytes, { filename, contentType } = {}) {
  assertEditorialDataset(dataset);
  assertSanityWritable(env);
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = new URL(
    `https://${projectId}.api.sanity.io/${API_VERSION}/assets/${kind === "files" ? "files" : "images"}/${dataset}`,
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

/**
 * Give a staging photo the name ops looks it up by. Sanity hands back an
 * existing asset when the bytes match, keeping its old name.
 */
export async function sanityRenameImageAsset(env, dataset, assetId, filename) {
  assertEditorialDataset(dataset);
  if (!assetId || !filename) return;
  await sanityMutateDataset(env, dataset, [
    { patch: { id: assetId, set: { originalFilename: filename } } },
  ]);
}

/**
 * Production writes are only a copy of a document that already exists in
 * staging. Feature publish uses this. Everyday edits stay on staging.
 */
async function sanityMutateDataset(env, dataset, mutations) {
  assertSanityWritable(env);
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

export async function sanityMutateProduction(env, mutations) {
  return sanityMutateDataset(env, "production", mutations);
}

export async function sanityUploadImageProduction(env, bytes, meta) {
  return sanityUploadAssetProduction(env, "images", bytes, meta);
}

/** Upload an image or file asset to production. Asset ids are content hashes, so they match staging. */
export async function sanityUploadAssetProduction(env, kind, bytes, { filename, contentType } = {}) {
  assertSanityWritable(env);
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = new URL(
    `https://${projectId}.api.sanity.io/${API_VERSION}/assets/${kind === "files" ? "files" : "images"}/production`,
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
    const error = new Error(payload.message || `Asset upload failed (${response.status}).`);
    error.status = 502;
    throw error;
  }
  return payload?.document ?? null;
}
