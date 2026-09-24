import { configEnvName } from "../../../../shared/config-db.js";

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

/** Local ops works on a copy of the Ops DB. It must never touch what the hosted sites read. */
export function isLocalOps(env = {}) {
  return configEnvName(env) === "local";
}

export function assertNotLocal(env, message = "Local ops cannot change the live site.") {
  if (!isLocalOps(env)) return;
  const error = new Error(message);
  error.status = 403;
  throw error;
}

const DRAFT_PREFIX = "drafts.";

export function draftId(id) {
  const value = String(id || "");
  return value.startsWith(DRAFT_PREFIX) ? value : `${DRAFT_PREFIX}${value}`;
}

export function publishedId(id) {
  const value = String(id || "");
  return value.startsWith(DRAFT_PREFIX) ? value.slice(DRAFT_PREFIX.length) : value;
}

/**
 * Drafts may point at documents that only exist as drafts, which a strong
 * reference forbids. Weak refs still resolve under the previewDrafts perspective.
 */
export function weakenReferences(value) {
  if (Array.isArray(value)) return value.map(weakenReferences);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = weakenReferences(child);
  if (typeof out._ref === "string" && !/^(image|file)-/.test(out._ref)) out._weak = true;
  return out;
}

function draftDocument(doc, id) {
  const { _rev, _updatedAt, _createdAt, ...rest } = doc || {};
  return weakenReferences({ ...rest, _id: draftId(id) });
}

function randomDocId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Local ops writes drafts over the staging documents, never the published
 * versions. The local site reads with the previewDrafts perspective, so it
 * shows the change; gwenda-staging and production read published only.
 * Deletes only drop the local draft: a removal cannot be previewed.
 */
export async function draftMutations(env, dataset, mutations, query = sanityQuery) {
  const patchIds = mutations
    .map((mutation) => mutation.patch?.id)
    .filter(Boolean)
    .map(publishedId);
  const existing = new Map();
  if (patchIds.length) {
    const ids = [...new Set(patchIds)].flatMap((id) => [id, draftId(id)]);
    const rows = (await query(env, dataset, `*[_id in $ids]`, { ids })) || [];
    for (const row of rows) existing.set(row._id, row);
  }
  const out = [];
  for (const mutation of mutations) {
    if (mutation.createOrReplace) {
      out.push({ createOrReplace: draftDocument(mutation.createOrReplace, publishedId(mutation.createOrReplace._id)) });
    } else if (mutation.createIfNotExists) {
      out.push({ createIfNotExists: draftDocument(mutation.createIfNotExists, publishedId(mutation.createIfNotExists._id)) });
    } else if (mutation.create) {
      const id = mutation.create._id ? publishedId(mutation.create._id) : randomDocId();
      out.push({ create: draftDocument(mutation.create, id) });
    } else if (mutation.patch) {
      const id = publishedId(mutation.patch.id);
      const draft = existing.get(draftId(id));
      const published = existing.get(id);
      if (!draft && !published) continue;
      if (!draft) out.push({ createIfNotExists: draftDocument(published, id) });
      const { id: _ignored, ...ops } = mutation.patch;
      out.push({ patch: { id: draftId(id), ...weakenReferences(ops) } });
    } else if (mutation.delete) {
      out.push({ delete: { id: draftId(publishedId(mutation.delete.id)) } });
    } else {
      out.push(mutation);
    }
  }
  return out;
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
  const local = isLocalOps(env);
  if (local) mutations = await draftMutations(env, dataset, mutations);
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
  if (local && Array.isArray(payload?.results)) {
    // Callers store these ids in the Ops DB, so hand back the published id.
    payload.results = payload.results.map((row) =>
      row?.id ? { ...row, id: publishedId(row.id) } : row,
    );
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

/**
 * Production writes are only a copy of a document that already exists in
 * staging. Feature publish uses this. Everyday edits stay on staging.
 */
async function sanityMutateDataset(env, dataset, mutations) {
  assertNotLocal(env);
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
  assertNotLocal(env);
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
