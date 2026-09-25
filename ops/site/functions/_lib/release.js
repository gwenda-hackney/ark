/**
 * Website release: staging → production, document by document. The same
 * engine runs the other way (production → staging) to reset staging.
 *
 * The diff compares published documents only. Drafts (including local ops
 * previews) never reach production. Publishing copies the chosen documents,
 * anything they reference that also changed, and any image or file assets
 * production is missing. Removals run last, one by one, because production
 * refuses to delete a document another document still points at.
 */
import {
  EDITORIAL_DATASET,
  assertNotLocal,
  sanityMutate,
  sanityMutateProduction,
  sanityQuery,
  sanityUploadAsset,
  sanityUploadAssetProduction,
} from "./sanity.js";
import { listEvents, saveOccurrenceSnapshots } from "./event-store.js";
import { copyStagingSnapshotsToProduction } from "./publish-sync.js";

const CONTENT_FILTER = [
  '!(_id in path("drafts.**"))',
  '!(_id in path("versions.**"))',
  '!(_id in path("_.**"))',
  '!(_id in path("system.**"))',
  '!(_type match "sanity.*")',
  '!(_type match "system.*")',
].join(" && ");

const DOCS_QUERY = `*[${CONTENT_FILTER}]`;
const ASSET_QUERY = `*[_id in $ids]{ _id, url, originalFilename, mimeType }`;

const SYSTEM_KEYS = new Set(["_rev", "_updatedAt", "_createdAt"]);
const HIDDEN_FIELDS = new Set(["_id", "_type", ...SYSTEM_KEYS]);

/** Display order and names for the groups on the Release page. */
const TYPE_GROUPS = [
  ["eventSeries", "Series"],
  ["event", "Nights"],
  ["menuSection", "Menu sections"],
  ["menuItem", "Menu items"],
  ["artist", "Artists"],
  ["form", "Forms"],
];
const TYPE_ORDER = new Map(TYPE_GROUPS.map(([type], index) => [type, index]));
const TYPE_LABELS = new Map(TYPE_GROUPS);

function humanize(key) {
  const words = String(key || "")
    .replace(/^_+/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : String(key);
}

export function typeLabel(type) {
  return TYPE_LABELS.get(type) || humanize(type);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The document as production should hold it: no revision or timestamps. */
export function releaseDocument(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc || {})) {
    if (!SYSTEM_KEYS.has(key)) out[key] = value;
  }
  return out;
}

function isAssetRef(ref) {
  return /^(image|file)-/.test(ref);
}

/** Every `_ref` in a document, split into document references and assets. */
export function collectRefs(value, out = { docs: new Set(), assets: new Set() }) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out);
  } else if (value && typeof value === "object") {
    if (typeof value._ref === "string" && value._ref) {
      (isAssetRef(value._ref) ? out.assets : out.docs).add(value._ref);
    }
    for (const child of Object.values(value)) collectRefs(child, out);
  }
  return out;
}

function truncate(text, max = 160) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function blockText(blocks) {
  return blocks
    .filter((block) => block?._type === "block" && Array.isArray(block.children))
    .map((block) => block.children.map((child) => child?.text || "").join(""))
    .join(" ");
}

/** One-line human summary of a field value for the diff. */
export function summarizeValue(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    if (value.some((item) => item?._type === "block")) return truncate(blockText(value)) || "—";
    if (value.every((item) => typeof item === "string")) return truncate(value.join(", "));
    return value.length === 1 ? "1 item" : `${value.length} items`;
  }
  if (typeof value === "object") {
    if (value.asset?._ref) return `Image ${String(value.asset._ref).split("-")[1]?.slice(0, 8) || ""}`.trim();
    if (typeof value._ref === "string") return `→ ${value._ref}`;
    if (typeof value.current === "string") return value.current;
    return truncate(JSON.stringify(value));
  }
  return truncate(String(value));
}

export function documentLabel(doc) {
  if (!doc) return "";
  const title = doc.title || doc.name || doc.label || doc.slug?.current || doc._id;
  if (doc._type === "event" && doc.date) return `${title} · ${doc.date}`;
  return String(title);
}

function fieldChanges(staging, production) {
  const keys = new Set([...Object.keys(staging || {}), ...Object.keys(production || {})]);
  const out = [];
  for (const key of [...keys].sort()) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const next = staging?.[key];
    const prev = production?.[key];
    if (stableStringify(next) === stableStringify(prev)) continue;
    const stagingSummary = summarizeValue(next);
    const productionSummary = summarizeValue(prev);
    out.push({
      key,
      label: humanize(key),
      staging: stagingSummary,
      production: productionSummary,
      // Same summary but different data: crop, hotspot, marks, keys.
      detailOnly: stagingSummary === productionSummary,
    });
  }
  return out;
}

/** Compare published staging against production. */
export function computeReleaseDiff(stagingDocs, productionDocs) {
  const staging = new Map((stagingDocs || []).map((doc) => [doc._id, doc]));
  const production = new Map((productionDocs || []).map((doc) => [doc._id, doc]));
  const entries = [];
  for (const [id, doc] of staging) {
    const live = production.get(id);
    if (!live) {
      entries.push({ id, doc, change: "added", fields: fieldChanges(releaseDocument(doc), null) });
      continue;
    }
    if (stableStringify(releaseDocument(doc)) === stableStringify(releaseDocument(live))) continue;
    entries.push({
      id,
      doc,
      change: "changed",
      fields: fieldChanges(releaseDocument(doc), releaseDocument(live)),
    });
  }
  for (const [id, doc] of production) {
    if (!staging.has(id)) entries.push({ id, doc, change: "removed", fields: [] });
  }
  return entries
    .map(({ id, doc, change, fields }) => ({
      id,
      type: doc._type,
      typeLabel: typeLabel(doc._type),
      label: documentLabel(doc),
      change,
      fields,
      refs: change === "removed" ? [] : [...collectRefs(doc).docs],
    }))
    .sort((a, b) => {
      const order = (TYPE_ORDER.get(a.type) ?? 99) - (TYPE_ORDER.get(b.type) ?? 99);
      if (order) return order;
      if (a.typeLabel !== b.typeLabel) return a.typeLabel.localeCompare(b.typeLabel);
      return a.label.localeCompare(b.label);
    });
}

/**
 * Which documents to write and delete. A chosen document drags in anything it
 * references that is also new or changed, written first so references resolve.
 */
export function planRelease(entries, ids = null) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const chosen = ids ? new Set(ids.filter((id) => byId.has(id))) : new Set(byId.keys());
  const writes = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    const entry = byId.get(id);
    if (!entry || entry.change === "removed") return;
    seen.add(id);
    for (const ref of entry.refs) visit(ref);
    writes.push(id);
  };
  for (const id of chosen) visit(id);
  const deletes = [...chosen].filter((id) => byId.get(id)?.change === "removed");
  const included = writes.filter((id) => !chosen.has(id));
  return { writes, deletes, included };
}

async function loadDatasets(env, query) {
  const [staging, production] = await Promise.all([
    query(env, EDITORIAL_DATASET, DOCS_QUERY),
    query(env, "production", DOCS_QUERY),
  ]);
  return { staging: staging || [], production: production || [] };
}

export async function getReleaseDiff(env, { query = sanityQuery } = {}) {
  const { staging, production } = await loadDatasets(env, query);
  const entries = computeReleaseDiff(staging, production);
  return {
    entries,
    counts: {
      added: entries.filter((entry) => entry.change === "added").length,
      changed: entries.filter((entry) => entry.change === "changed").length,
      removed: entries.filter((entry) => entry.change === "removed").length,
    },
  };
}

function remapAssets(value, map) {
  if (!map.size) return value;
  if (Array.isArray(value)) return value.map((item) => remapAssets(item, map));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = remapAssets(child, map);
  if (typeof out._ref === "string" && map.has(out._ref)) out._ref = map.get(out._ref);
  return out;
}

/** Where documents come from and go to, and how to write the target. */
export const DIRECTIONS = {
  "to-production": {
    source: EDITORIAL_DATASET,
    target: "production",
    sourceLabel: "staging",
    targetLabel: "the live site",
  },
  "to-staging": {
    source: "production",
    target: EDITORIAL_DATASET,
    sourceLabel: "the live site",
    targetLabel: "staging",
  },
};

function directionFor(value) {
  const direction = DIRECTIONS[value || "to-production"];
  if (!direction) {
    const error = new Error('direction must be "to-production" or "to-staging".');
    error.status = 400;
    throw error;
  }
  return direction;
}

async function copyMissingAssets(env, docs, { query, upload, fetchImpl, direction }) {
  const wanted = new Set();
  for (const doc of docs) for (const ref of collectRefs(doc).assets) wanted.add(ref);
  const map = new Map();
  if (!wanted.size) return { map, copied: 0 };
  const ids = [...wanted];
  const present = new Set((await query(env, direction.target, `*[_id in $ids]._id`, { ids })) || []);
  const missing = ids.filter((id) => !present.has(id));
  if (!missing.length) return { map, copied: 0 };
  const sources = (await query(env, direction.source, ASSET_QUERY, { ids: missing })) || [];
  let copied = 0;
  for (const asset of sources) {
    if (!asset?.url) continue;
    const response = await fetchImpl(asset.url, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) {
      const error = new Error(
        `Could not read ${asset.originalFilename || asset._id} from ${direction.sourceLabel}.`,
      );
      error.status = 502;
      throw error;
    }
    const bytes = await response.arrayBuffer();
    const kind = asset._id.startsWith("file-") ? "files" : "images";
    const uploaded = await upload(env, kind, bytes, {
      filename: asset.originalFilename || undefined,
      contentType: asset.mimeType || response.headers.get("content-type") || undefined,
    });
    if (uploaded?._id && uploaded._id !== asset._id) map.set(asset._id, uploaded._id);
    copied += 1;
  }
  return { map, copied };
}

/**
 * Copy one dataset onto the other. Default: staging onto production.
 * `direction: "to-staging"` copies production back onto staging. `ids` limits
 * it to chosen documents; omit to copy everything that differs. The diff is
 * recomputed here, never trusted from the browser.
 */
export async function publishRelease(
  env,
  { ids = null, direction: directionName = "to-production" } = {},
  {
    query = sanityQuery,
    mutate = null,
    upload = null,
    fetchImpl = fetch,
  } = {},
) {
  assertNotLocal(env, "Local ops cannot publish or reset the hosted sites.");
  const direction = directionFor(directionName);
  const toStaging = direction.target === EDITORIAL_DATASET;
  const write =
    mutate ||
    (toStaging
      ? (e, batch) => sanityMutate(e, EDITORIAL_DATASET, batch)
      : sanityMutateProduction);
  const put =
    upload ||
    (toStaging
      ? (e, kind, bytes, meta) => sanityUploadAsset(e, EDITORIAL_DATASET, kind, bytes, meta)
      : sanityUploadAssetProduction);
  const { staging, production } = await loadDatasets(env, query);
  const [sourceDocs, targetDocs] = toStaging ? [production, staging] : [staging, production];
  const entries = computeReleaseDiff(sourceDocs, targetDocs);
  const plan = planRelease(entries, ids);
  const sourceById = new Map(sourceDocs.map((doc) => [doc._id, doc]));
  const docs = plan.writes.map((id) => releaseDocument(sourceById.get(id)));

  const assets = await copyMissingAssets(env, docs, {
    query,
    upload: put,
    fetchImpl,
    direction,
  });
  const mutations = docs.map((doc) => ({ createOrReplace: remapAssets(doc, assets.map) }));
  for (let i = 0; i < mutations.length; i += 50) {
    await write(env, mutations.slice(i, i + 50));
  }

  const warnings = [];
  const deleted = [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const id of plan.deletes) {
    try {
      await write(env, [{ delete: { id } }]);
      deleted.push(id);
    } catch (error) {
      warnings.push(
        `${byId.get(id)?.label || id} was not removed: ${error?.message || `still in use on ${direction.targetLabel}.`}`,
      );
    }
  }

  return {
    direction: directionName,
    // Publish all: every source document now matches the target.
    inSync: ids ? null : sourceDocs.map((doc) => doc._id),
    written: plan.writes,
    deleted,
    included: plan.included,
    assetsCopied: assets.copied,
    warnings,
  };
}

/** Mark ops rows whose documents just went live, so event and menu status read "Live". */
export async function markReleasedInOps(env, sanityIds) {
  const ids = new Set(sanityIds);
  if (!ids.size) return { nights: 0, menuItems: 0 };
  const at = new Date().toISOString();
  const updates = [];
  for (const event of await listEvents(env)) {
    for (const row of event.dates || []) {
      if (!row.id || !row.sanityId || !ids.has(row.sanityId) || !row.snapshots?.staging) continue;
      if (row.snapshots.production?.hash === row.snapshots.staging.hash) continue;
      updates.push({
        id: Number(row.id),
        snapshots: { ...row.snapshots, production: { hash: row.snapshots.staging.hash, at } },
      });
    }
  }
  // One batch call instead of one per night (Cloudflare call limit).
  await saveOccurrenceSnapshots(env, updates);
  const menu = await copyStagingSnapshotsToProduction(env, { sanityIds: ids });
  return { nights: updates.length, menuItems: menu.copied };
}
