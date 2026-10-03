/**
 * Website release: publish drafts, document by document. The diff compares
 * the preview (drafts over published) with what the website shows (published
 * only). Publishing writes each chosen draft over its published document and
 * drops the draft, together with anything it references that also changed.
 * Discarding drops the drafts, so the preview matches the website again.
 *
 * A draft marked `removed` (a night dropped from its series' schedule) is a
 * removal: publishing deletes the document and its draft. Deleting in ops
 * doesn't wait for this: it removes both at once (sanity.js draftMutations).
 */
import {
  PREVIEW,
  assertSanityWritable,
  draftId,
  sanityMutatePublished,
  sanityQuery,
} from "../../platform/sanity.js";
import {
  listEvents,
  removeOccurrence,
  saveOccurrenceSnapshots,
} from "../../events/server/event-store.js";
import { copyPreviewSnapshotsToProduction } from "./publish-sync.js";

const CONTENT_FILTER = [
  '!(_id in path("drafts.**"))',
  '!(_id in path("versions.**"))',
  '!(_id in path("_.**"))',
  '!(_id in path("system.**"))',
  '!(_type match "sanity.*")',
  '!(_type match "system.*")',
].join(" && ");

const DOCS_QUERY = `*[${CONTENT_FILTER}]`;

const SYSTEM_KEYS = new Set(["_rev", "_updatedAt", "_createdAt", "_originalId"]);
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

/**
 * Drafts hold references weak until publish (sanity.js weakenReferences): the
 * published copy gets them strong again, unless the reference was meant weak.
 */
export function strengthenReferences(value) {
  if (Array.isArray(value)) return value.map(strengthenReferences);
  if (!value || typeof value !== "object") return value;
  if (value._strengthenOnPublish) {
    const { _strengthenOnPublish: plan, _weak, ...ref } = value;
    return plan.weak ? { ...ref, _weak: true } : ref;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strengthenReferences(item)]));
}

/** The document as the website should hold it: no revision, timestamps or draft id, strong references. */
export function releaseDocument(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc || {})) {
    if (!SYSTEM_KEYS.has(key)) out[key] = strengthenReferences(value);
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

function fieldChanges(preview, production) {
  const keys = new Set([...Object.keys(preview || {}), ...Object.keys(production || {})]);
  const out = [];
  for (const key of [...keys].sort()) {
    if (HIDDEN_FIELDS.has(key)) continue;
    const next = preview?.[key];
    const prev = production?.[key];
    if (stableStringify(next) === stableStringify(prev)) continue;
    const previewSummary = summarizeValue(next);
    const productionSummary = summarizeValue(prev);
    out.push({
      key,
      label: humanize(key),
      preview: previewSummary,
      production: productionSummary,
      // Same summary but different data: crop, hotspot, marks, keys.
      detailOnly: previewSummary === productionSummary,
    });
  }
  return out;
}

/** Compare the preview (drafts over published) against what the website shows. */
export function computeReleaseDiff(previewDocs, productionDocs) {
  const preview = new Map(
    (previewDocs || []).filter((doc) => doc.removed !== true).map((doc) => [doc._id, doc]),
  );
  const production = new Map((productionDocs || []).map((doc) => [doc._id, doc]));
  const entries = [];
  for (const [id, doc] of preview) {
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
    if (!preview.has(id)) entries.push({ id, doc, change: "removed", fields: [] });
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

async function loadViews(env, query) {
  const [preview, production] = await Promise.all([
    query(env, PREVIEW, DOCS_QUERY),
    query(env, "production", DOCS_QUERY),
  ]);
  return { preview: preview || [], production: production || [] };
}

export async function getReleaseDiff(env, { query = sanityQuery } = {}) {
  const { preview, production } = await loadViews(env, query);
  const entries = computeReleaseDiff(preview, production);
  return {
    entries,
    counts: {
      added: entries.filter((entry) => entry.change === "added").length,
      changed: entries.filter((entry) => entry.change === "changed").length,
      removed: entries.filter((entry) => entry.change === "removed").length,
    },
  };
}

export const DIRECTIONS = ["to-production", "discard"];

/**
 * Publish the preview to the website (default), or `direction: "discard"` to
 * drop drafts so the preview shows the website again. `ids` limits it to
 * chosen documents; omit to take everything that differs. The diff is
 * recomputed here, never trusted from the browser.
 */
export async function publishRelease(
  env,
  { ids = null, direction = "to-production" } = {},
  { query = sanityQuery, mutate = sanityMutatePublished } = {},
) {
  assertSanityWritable(env);
  if (!DIRECTIONS.includes(direction)) {
    const error = new Error('direction must be "to-production" or "discard".');
    error.status = 400;
    throw error;
  }
  const { preview, production } = await loadViews(env, query);
  const entries = computeReleaseDiff(preview, production);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  if (direction === "discard") {
    const chosen = (ids || [...byId.keys()]).filter((id) => byId.has(id));
    for (let i = 0; i < chosen.length; i += 50) {
      await mutate(env, chosen.slice(i, i + 50).map((id) => ({ delete: { id: draftId(id) } })));
    }
    return { direction, inSync: null, written: [], discarded: chosen, deleted: [], included: [], warnings: [] };
  }

  const plan = planRelease(entries, ids);
  const previewById = new Map(preview.map((doc) => [doc._id, doc]));
  // Drafts that already match the website (a night restaged with no real
  // change) have nothing to publish; drop them so no stray drafts remain (#56).
  const scope = new Set(ids || previewById.keys());
  const leftoverDrafts = preview
    .filter((doc) => scope.has(doc._id) && !byId.has(doc._id) && doc._originalId === draftId(doc._id))
    .map((doc) => doc._id);
  for (let i = 0; i < leftoverDrafts.length; i += 50) {
    await mutate(env, leftoverDrafts.slice(i, i + 50).map((id) => ({ delete: { id: draftId(id) } })));
  }
  // Each document's publish and draft removal travel in the same transaction.
  for (let i = 0; i < plan.writes.length; i += 25) {
    await mutate(
      env,
      plan.writes.slice(i, i + 25).flatMap((id) => [
        { createOrReplace: releaseDocument(previewById.get(id)) },
        { delete: { id: draftId(id) } },
      ]),
    );
  }

  // Dropped nights (drafts marked removed), or a document deleted outside ops.
  const warnings = [];
  const deleted = [];
  for (const id of plan.deletes) {
    try {
      await mutate(env, [{ delete: { id: draftId(id) } }, { delete: { id } }]);
      deleted.push(id);
    } catch (error) {
      warnings.push(
        `${byId.get(id)?.label || id} was not removed: ${error?.message || "still in use on the website."}`,
      );
    }
  }

  return {
    direction,
    // Publish all: every preview document now matches the website.
    inSync: ids ? null : preview.map((doc) => doc._id),
    written: plan.writes,
    deleted,
    included: plan.included,
    warnings,
  };
}

/**
 * Mark ops rows whose documents just went live, so event and menu status read
 * "Live". `deleted`: documents just taken off the website; a dropped night's
 * row, kept until then (#20), goes now.
 */
export async function markReleasedInOps(env, sanityIds, { deleted = [] } = {}) {
  const ids = new Set(sanityIds);
  const gone = new Set(deleted);
  if (!ids.size && !gone.size) return { nights: 0, menuItems: 0 };
  const at = new Date().toISOString();
  const updates = [];
  for (const event of await listEvents(env)) {
    for (const row of event.dates || []) {
      if (row.id && gone.has(row.sanityId) && row.snapshots?.preview?.removed) {
        await removeOccurrence(env, row.id);
        continue;
      }
      if (!row.id || !row.sanityId || !ids.has(row.sanityId) || !row.snapshots?.preview) continue;
      if (row.snapshots.production?.hash === row.snapshots.preview.hash) continue;
      updates.push({
        id: Number(row.id),
        snapshots: { ...row.snapshots, production: { hash: row.snapshots.preview.hash, at } },
      });
    }
  }
  // One batch call instead of one per night (Cloudflare call limit).
  await saveOccurrenceSnapshots(env, updates);
  if (!ids.size) return { nights: updates.length, menuItems: 0 };
  const menu = await copyPreviewSnapshotsToProduction(env, { sanityIds: ids });
  return { nights: updates.length, menuItems: menu.copied };
}

/**
 * Drafts just discarded: a dropped night whose "removed" draft went with them
 * is no longer marked on the preview, so its note goes and the website job
 * marks it again (#20).
 */
export async function markDiscardedInOps(env, sanityIds) {
  const ids = new Set(sanityIds);
  if (!ids.size) return 0;
  const updates = [];
  for (const event of await listEvents(env)) {
    for (const row of event.dates || []) {
      if (!row.id || !ids.has(row.sanityId) || !row.snapshots?.preview?.removed) continue;
      const { preview: _removed, ...snapshots } = row.snapshots;
      updates.push({ id: Number(row.id), snapshots });
    }
  }
  await saveOccurrenceSnapshots(env, updates);
  return updates.length;
}
