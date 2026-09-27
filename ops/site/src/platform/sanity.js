import { environmentOf, isLocalMachine } from "../../../../shared/config.js";

/** The real website's project. */
export const REAL_SANITY_PROJECT_ID = "pn5yjro6";
/** Free copy for local work, set up the same way (docs/sanity.md). */
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

/**
 * Each environment has one dataset. Ops and Studio edit drafts; publishing
 * turns a draft into the document the website shows (release.js).
 */
export const DATASET = "production";

/**
 * How ops reads the dataset: `preview` as the preview site shows it (drafts
 * over published), `production` as the live site does (published only).
 * `raw` sees drafts and published side by side, by their own ids.
 */
export const PREVIEW = "preview";
const PERSPECTIVES = { preview: "previewDrafts", production: "published", raw: "raw" };

export function draftId(id) {
  return id.startsWith("drafts.") ? id : `drafts.${id}`;
}

export function publishedId(id) {
  return String(id).replace(/^drafts\./, "");
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

function headers(token, extra = {}) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** Read one view of the dataset: "preview", "production" or "raw". */
export async function sanityQuery(env, view, query, params = {}) {
  const perspective = PERSPECTIVES[view];
  if (!perspective) {
    const error = new Error(`Unknown Sanity view "${view}".`);
    error.status = 500;
    throw error;
  }
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = new URL(
    `https://${projectId}.api.sanity.io/${API_VERSION}/data/query/${DATASET}`,
  );
  url.searchParams.set("query", query);
  url.searchParams.set("perspective", perspective);
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

const SYSTEM_KEYS = new Set(["_rev", "_updatedAt", "_createdAt", "_originalId"]);

function withoutSystemKeys(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc || {})) {
    if (!SYSTEM_KEYS.has(key)) out[key] = value;
  }
  return out;
}

const ASSET_REF = /^(image|file)-/;

/**
 * A draft may point at a document that so far exists only as a draft (a new
 * series, a new parent section), and Sanity refuses a strong reference to a
 * missing document. So draft references are weak and marked to be made strong
 * on publish, as Sanity Studio does; release.js strengthens them when it
 * publishes. `typeOf(id)` names the target's type when this save writes it.
 */
export function weakenReferences(value, typeOf = () => "") {
  if (Array.isArray(value)) return value.map((item) => weakenReferences(item, typeOf));
  if (!value || typeof value !== "object") return value;
  if (typeof value._ref === "string" && !ASSET_REF.test(value._ref) && !value._weak) {
    const type = typeOf(value._ref);
    return { ...value, _weak: true, _strengthenOnPublish: type ? { type } : {} };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, weakenReferences(item, typeOf)]),
  );
}

function weakenPatch(body, typeOf) {
  const out = { ...body };
  for (const key of ["set", "setIfMissing"]) {
    if (out[key]) out[key] = weakenReferences(out[key], typeOf);
  }
  if (out.insert?.items) out.insert = { ...out.insert, items: weakenReferences(out.insert.items, typeOf) };
  return out;
}

/**
 * Ops' writes as draft writes. Creates and replaces land on the draft; a patch
 * first copies the published document into a draft if there is none yet
 * (`existing` holds both, raw). A delete removes the draft and the published
 * document: taking something away goes straight to the website. References
 * in what ops writes become weak until publish (weakenReferences).
 */
export function draftMutations(mutations, existing = [], newId = () => crypto.randomUUID()) {
  const byId = new Map(existing.map((doc) => [doc._id, doc]));
  const typeById = new Map();
  for (const mutation of mutations) {
    const body = mutation.create || mutation.createOrReplace || mutation.createIfNotExists;
    if (body?._id && body._type) typeById.set(publishedId(body._id), body._type);
  }
  const typeOf = (id) => typeById.get(publishedId(id)) || "";
  const out = [];
  for (const mutation of mutations) {
    const [kind, body] = Object.entries(mutation)[0] || [];
    if (kind === "create" || kind === "createOrReplace" || kind === "createIfNotExists") {
      const id = body._id ? publishedId(body._id) : newId();
      out.push({ [kind]: { ...weakenReferences(body, typeOf), _id: draftId(id) } });
    } else if (kind === "patch") {
      const id = publishedId(body.id);
      if (!byId.has(draftId(id)) && byId.has(id)) {
        out.push({ createIfNotExists: { ...withoutSystemKeys(byId.get(id)), _id: draftId(id) } });
      }
      out.push({ patch: { ...weakenPatch(body, typeOf), id: draftId(id) } });
    } else if (kind === "delete") {
      const id = publishedId(body.id);
      out.push({ delete: { id: draftId(id) } }, { delete: { id } });
    } else {
      const error = new Error(`Ops cannot send a "${kind}" mutation.`);
      error.status = 500;
      throw error;
    }
  }
  return out;
}

/**
 * Save for the preview: every write becomes a draft (draftMutations). Result
 * ids are the documents' own ids, never "drafts.…", so Baserow links stay put.
 */
export async function sanityMutate(env, mutations, { query = sanityQuery, send = sanityMutatePublished } = {}) {
  assertSanityWritable(env);
  if (!mutations.length) return { results: [] };
  const patched = mutations.filter((m) => m.patch).map((m) => publishedId(m.patch.id));
  const existing = patched.length
    ? await query(env, "raw", "*[_id in $ids]", { ids: [...patched, ...patched.map(draftId)] })
    : [];
  const payload = await send(env, draftMutations(mutations, existing || []));
  return {
    ...payload,
    results: (payload?.results || []).map((row) => ({ ...row, id: publishedId(row.id) })),
  };
}

export async function sanityUploadImage(env, bytes, meta) {
  return sanityUploadAsset(env, "images", bytes, meta);
}

/** Upload an image or file asset. Assets have no drafts: the preview and the website share them. */
export async function sanityUploadAsset(env, kind, bytes, { filename, contentType } = {}) {
  assertSanityWritable(env);
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = new URL(
    `https://${projectId}.api.sanity.io/${API_VERSION}/assets/${kind === "files" ? "files" : "images"}/${DATASET}`,
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
 * Give an uploaded photo the name ops looks it up by. Sanity hands back an
 * existing asset when the bytes match, keeping its old name.
 */
export async function sanityRenameImageAsset(env, assetId, filename) {
  if (!assetId || !filename) return;
  await sanityMutatePublished(env, [
    { patch: { id: assetId, set: { originalFilename: filename } } },
  ]);
}

/**
 * Send mutations exactly as given, drafts or not. Publishing and discarding
 * drafts (release.js) and asset renames use this; everyday saves go through
 * sanityMutate.
 */
export async function sanityMutatePublished(env, mutations) {
  assertSanityWritable(env);
  if (!mutations.length) return { results: [] };
  const token = env.SANITY_API_TOKEN?.trim();
  if (!token) {
    const error = new Error("SANITY_API_TOKEN is not configured for publish sync.");
    error.status = 503;
    throw error;
  }
  const projectId = sanityProjectId(env);
  const url = `https://${projectId}.api.sanity.io/${API_VERSION}/data/mutate/${DATASET}?returnIds=true`;
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
