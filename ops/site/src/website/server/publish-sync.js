import {
  photoFingerprint,
  projectionHash,
  recordTargetSnapshot,
  sanityPatchFromProjection,
  websiteProjection,
} from "../../inventory/server/reconcile.js";
import {
  digitalSectionId,
  hasDigitalPlacement,
} from "../../menu/server/menu-placements.js";
import { flattenMenuSections } from "../../menu/menu-sections.js";
import { listPopupSeries } from "../../events/server/popups.js";
import { loadMenuTree } from "../../menu/server/menu-store.js";
import {
  PREVIEW,
  sanityMutate,
  sanityQuery,
  sanityUploadImage,
} from "../../platform/sanity.js";

/** Sortable Sanity orderRank from the menu's numeric order (create only). */
export function orderRankFromOrder(order, kind = "item") {
  const n = Math.max(0, Math.floor(Number(order) || 0));
  const tag = kind === "section" ? "s" : "i";
  return `0|i${String(n).padStart(8, "0")}${tag}:`;
}

export function slugifySection(title, fallback = "section") {
  const slug = String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/**
 * Mutations one Sanity request carries, as one transaction. Cloudflare caps
 * the outside calls one request makes (50 on the free plan), so a publish
 * sends its writes together instead of one call per drink or section.
 */
export const MUTATIONS_PER_REQUEST = 50;

const SECTION_FIELDS = `_id, title, subtitle, orderRank, kind, "parent": parent._ref, "popupSeries": popupSeries._ref`;

/** The whole menu as the preview has it: few documents, small fields, one query. */
const PREVIEW_MENU_QUERY = `{
  "items": *[_type == "menuItem"]{ _id, name },
  "sections": *[_type == "menuSection"]{ ${SECTION_FIELDS}, "slug": slug.current }
}`;

/**
 * The menu's documents on the preview, read once, so a publish finds each
 * drink and section without a call of its own: a drink by its link or else
 * by name, a section by its link or else by slug. What this publish creates
 * or changes goes in as it is planned, so a later lookup sees it as a query
 * sent after that write would have.
 */
async function previewMenu(env) {
  const result = (await sanityQuery(env, PREVIEW, PREVIEW_MENU_QUERY)) || {};
  const itemById = new Map();
  const itemByName = new Map();
  const sectionById = new Map();
  const sectionBySlug = new Map();
  const index = {
    addItem(doc) {
      itemById.set(doc._id, doc);
      if (doc.name && !itemByName.has(doc.name)) itemByName.set(doc.name, doc);
    },
    addSection(doc) {
      sectionById.set(doc._id, doc);
      if (doc.slug && !sectionBySlug.has(doc.slug)) sectionBySlug.set(doc.slug, doc);
    },
    itemId(item) {
      const doc = (item.sanityId && itemById.get(item.sanityId)) || itemByName.get(item.name);
      return doc?._id || null;
    },
    section(sanityId, slug) {
      return (sanityId && sectionById.get(sanityId)) || sectionBySlug.get(slug) || null;
    },
  };
  for (const doc of result.items || []) index.addItem(doc);
  for (const doc of result.sections || []) index.addSection(doc);
  return index;
}

/**
 * Writes to the preview, planned first and sent at the end in transactions
 * of MUTATIONS_PER_REQUEST. `then` records what ops keeps about a write
 * (links, snapshots) once its transaction is in, so a failed one records
 * nothing it didn't do.
 */
function previewWrites() {
  const queue = [];
  return {
    add(mutation, then = () => {}) {
      queue.push({ mutation, then });
    },
    async send(env) {
      while (queue.length) {
        const batch = queue.splice(0, MUTATIONS_PER_REQUEST);
        await sanityMutate(env, batch.map((entry) => entry.mutation));
        for (const entry of batch) entry.then();
      }
    },
  };
}

/** A new document's id, chosen here so its create can travel with the other writes. */
function newDocumentId() {
  return crypto.randomUUID();
}

/**
 * The drink's photo as a Sanity image. One uploaded in ops is already an
 * asset (#183) and is only referenced; one from before is still a Baserow
 * file and is copied, until the backfill gives it an asset.
 */
async function syncPhoto(env, item) {
  const assetId = item.image?.asset?._id;
  if (assetId) {
    return {
      _type: "image",
      alt: item.name,
      asset: { _type: "reference", _ref: assetId },
    };
  }
  const url = item.image?.asset?.url;
  if (!url) return undefined;
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const asset = await sanityUploadImage(env, bytes, {
    filename: `${item.name || "cocktail"}.jpg`,
    contentType,
  });
  if (!asset?._id) return undefined;
  return {
    _type: "image",
    alt: item.name,
    asset: { _type: "reference", _ref: asset._id },
  };
}

/**
 * What a publish writes back to the menu (Sanity ids, publish snapshots),
 * kept until the end and written in one go: one repository write however
 * many drinks changed.
 */
function pendingWrites() {
  const changes = [];
  return {
    item(id, fields) {
      changes.push({ op: "update", collection: "menu_items", id, fields });
    },
    section(id, fields) {
      changes.push({ op: "update", collection: "menu_sections", id, fields });
    },
    async flush(repo) {
      await repo.write(changes.splice(0));
    },
  };
}

function persistItemLinkAndSnapshot(pending, item, target, payload, sanityId) {
  const next = recordTargetSnapshot(item.publishSnapshots, target, payload);
  pending.item(item._id, {
    publishSnapshots: next,
    ...(!item.sanityId && sanityId ? { sanityId } : {}),
  });
}

function persistSectionLink(pending, section, sanityId) {
  if (section.sanityId === sanityId) return;
  pending.section(section._id, { sanityId });
  section.sanityId = sanityId;
}

function reference(id) {
  return { _type: "reference", _ref: id };
}

/**
 * A patch that makes `current` (the document as the preview shows it, with
 * references as plain ids) match `wanted`: a key whose value is null or ""
 * is unset. Null when nothing differs, so a publish with nothing changed
 * leaves no draft behind. `refs` names the keys that are references,
 * `sameAs` a key's own comparison.
 */
export function patchToMatch(current, wanted, { refs = {}, sameAs = {} } = {}) {
  const set = {};
  const unset = [];
  for (const [key, value] of Object.entries(wanted)) {
    const has = current?.[key] ?? null;
    const want = value === "" ? null : (value ?? null);
    if (sameAs[key] ? sameAs[key](has, want) : has === want) continue;
    if (want == null) unset.push(key);
    else set[key] = refs[key] ? refs[key](want) : want;
  }
  if (!Object.keys(set).length && !unset.length) return null;
  return {
    ...(Object.keys(set).length ? { set } : {}),
    ...(unset.length ? { unset } : {}),
  };
}

/**
 * Each pop-up kitchen's Sanity series document, by the series' ops id: only
 * the ones the preview has (a series never sent to the website has none, and
 * a chapter can't refer to a document that isn't there).
 */
async function popupSeriesDocuments(env, sections) {
  const wanted = new Set(
    flattenMenuSections(sections)
      .map((section) => section.popupSeriesId)
      .filter(Boolean)
      .map(String),
  );
  if (!wanted.size) return new Map();
  const popups = (await listPopupSeries(env)).filter((popup) => wanted.has(popup.id));
  if (!popups.length) return new Map();
  const there = new Set(
    (await sanityQuery(env, PREVIEW, "*[_id in $ids]._id", { ids: popups.map((popup) => popup.sanityId) })) || [],
  );
  return new Map(popups.filter((popup) => there.has(popup.sanityId)).map((popup) => [popup.id, popup.sanityId]));
}

const SECTION_REFS = { parent: reference, popupSeries: reference };

/** A chapter with no kind in Sanity is drinks: the website shows it on /bar either way. */
const SECTION_SAME = {
  kind: (has, want) => (want == null ? has == null : (has || "bar") === want),
};

/**
 * Ensure every ops section exists in Sanity, as ops has it; return map of
 * ops id → Sanity id. Parents are walked before children via
 * flattenMenuSections. Ops owns a section's title, subtitle, place in the
 * order, parent, and, for a chapter, whether it is drinks or food (`kind`)
 * and its pop-up kitchen (`popupSeries`, the event series' document); a
 * group carries neither, it follows its chapter. A
 * section already in Sanity is patched only where it differs. Its slug is
 * written when it is created and then left alone: it is a web address.
 */
function ensureSanitySections(pending, writes, menu, sections, popupDocs = new Map()) {
  const flat = flattenMenuSections(sections);
  const byBaserowId = new Map();
  let count = 0;

  for (const section of flat) {
    const slug =
      section.slug || slugifySection(section.title, `section-${section._id}`);
    const parentSanityId = section.parentId
      ? byBaserowId.get(String(section.parentId))
      : null;
    const chapter = !section.parentId;
    const wanted = {
      title: section.title || slug,
      subtitle: section.subtitle || null,
      orderRank: orderRankFromOrder(section.orderRank, "section"),
      parent: parentSanityId || null,
      kind: chapter ? section.kind || "bar" : null,
      popupSeries:
        (chapter && section.popupSeriesId && popupDocs.get(String(section.popupSeriesId))) || null,
    };

    // A link to a document that is gone is looked up again by slug.
    const current = menu.section(section.sanityId, slug);
    const link = (sanityId) => () => persistSectionLink(pending, section, sanityId);

    let sanityId;
    if (current) {
      sanityId = current._id;
      const patch = patchToMatch(current, wanted, { refs: SECTION_REFS, sameAs: SECTION_SAME });
      if (patch) {
        writes.add({ patch: { id: sanityId, ...patch } }, link(sanityId));
        for (const [key, value] of Object.entries(wanted)) {
          if (value == null || value === "") delete current[key];
          else current[key] = value;
        }
        count += 1;
      } else {
        link(sanityId)();
      }
    } else {
      sanityId = newDocumentId();
      const doc = { _id: sanityId, _type: "menuSection", slug: { _type: "slug", current: slug } };
      for (const [key, value] of Object.entries(wanted)) {
        if (value != null) doc[key] = SECTION_REFS[key] ? SECTION_REFS[key](value) : value;
      }
      writes.add({ create: doc }, link(sanityId));
      menu.addSection({ ...wanted, _id: sanityId, slug });
      count += 1;
    }

    byBaserowId.set(String(section._id), sanityId);
  }

  return { byBaserowId, writes: count };
}

function sectionRef(sanitySectionId) {
  if (!sanitySectionId) return null;
  return { _type: "reference", _ref: sanitySectionId };
}

/** A new drink's document, its photo uploaded first if it has to be. */
async function newItemDocument(env, item, payload, sanitySectionId) {
  const { set, unset } = sanityPatchFromProjection(payload);
  const doc = {
    _id: newDocumentId(),
    _type: "menuItem",
    ...set,
    orderRank: orderRankFromOrder(item.orderRank, "item"),
    section: sectionRef(sanitySectionId),
  };
  for (const key of unset) {
    if (key === "signature") continue;
    delete doc[key];
  }

  const url = item.image?.asset?.url;
  if (url) {
    try {
      const image = await syncPhoto(env, item);
      if (image) doc.image = image;
    } catch {
      // Create without photo if upload fails.
    }
  }
  return doc;
}

/**
 * Push guest-facing fields from the ops menu → Sanity drafts (the preview).
 * Creates missing sections/items. Recipes / method / glass stay in ops only.
 * `target` names the publish snapshot this records. What it learns (Sanity
 * ids, snapshots) is written back at the end, also when a step fails.
 */
export async function syncOpsMenuToSanity(env, { target = "preview" } = {}) {
  const { items, sections, repo } = await loadMenuTree(env);
  const pending = pendingWrites();
  try {
    return await publishItems(env, pending, { items, sections, target });
  } finally {
    await pending.flush(repo);
  }
}

async function publishItems(env, pending, { items, sections, target }) {

  const publishable = items.filter((item) =>
    Array.isArray(item.placements) && item.placements.length
      ? hasDigitalPlacement(item)
      : item.onDigitalMenu !== false,
  );
  const digitalSectionIds = new Set(
    publishable
      .map((item) => digitalSectionId(item) || item.sectionId || item.section?._id)
      .filter(Boolean)
      .map(String),
  );
  const flat = flattenMenuSections(sections);
  const sectionsForPublish = flat.filter(
    (section) =>
      digitalSectionIds.has(String(section._id)) ||
      flat.some(
        (child) =>
          digitalSectionIds.has(String(child._id)) &&
          String(child.parentId) === String(section._id),
      ),
  );
  // Include ancestors of digital sections so Sanity parents exist.
  const withAncestors = new Map(sectionsForPublish.map((s) => [String(s._id), s]));
  for (const section of sectionsForPublish) {
    let parentId = section.parentId;
    while (parentId && !withAncestors.has(String(parentId))) {
      const parent = flat.find((row) => String(row._id) === String(parentId));
      if (!parent) break;
      withAncestors.set(String(parent._id), parent);
      parentId = parent.parentId;
    }
  }

  const publishing = [...withAncestors.values()];
  const popupDocs = await popupSeriesDocuments(env, publishing);
  const menu = await previewMenu(env);
  const writes = previewWrites();
  const { byBaserowId: sectionIds, writes: sectionWrites } = ensureSanitySections(
    pending,
    writes,
    menu,
    publishing,
    popupDocs,
  );

  const created = [];
  const synced = [];
  const unchanged = [];
  const missing = [];

  for (const item of publishable) {
    const baserowSectionId = String(
      digitalSectionId(item) || item.sectionId || item.section?._id || "",
    );
    const sanitySectionId = baserowSectionId
      ? sectionIds.get(baserowSectionId)
      : null;

    if (!sanitySectionId) {
      missing.push(item.name || `item ${item._id}`);
      continue;
    }

    const sanityId = menu.itemId(item);
    const payload = websiteProjection(item);
    const previous = item.publishSnapshots?.[target];
    const hashMatches = previous?.hash === projectionHash(payload);
    const isNew = !sanityId;

    if (!isNew && hashMatches) {
      if (!item.sanityId) pending.item(item._id, { sanityId });
      unchanged.push({ id: item._id, name: item.name, sanityId });
      continue;
    }

    if (isNew) {
      const doc = await newItemDocument(env, item, payload, sanitySectionId);
      writes.add({ create: doc }, () => persistItemLinkAndSnapshot(pending, item, target, payload, doc._id));
      menu.addItem({ _id: doc._id, name: doc.name });
      created.push({ id: item._id, name: item.name, sanityId: doc._id });
      continue;
    }

    const { set, unset } = sanityPatchFromProjection(payload);
    set.section = sectionRef(sanitySectionId);
    const photoChanged = previous?.payload?.photo !== photoFingerprint(item);

    if (photoChanged) {
      const url = item.image?.asset?.url;
      if (!url) {
        unset.push("image");
      } else {
        try {
          const image = await syncPhoto(env, item);
          if (image) set.image = image;
        } catch {
          // Keep previous Sanity image if upload fails.
        }
      }
    }

    // `removed`: it was taken off the digital menu and is back (below).
    writes.add(
      { patch: { id: sanityId, set, unset: [...unset, "removed"] } },
      () => persistItemLinkAndSnapshot(pending, item, target, payload, sanityId),
    );
    synced.push({ id: item._id, name: item.name, sanityId });
  }

  const removed = await dropOffMenuItems(env, pending, writes, items, publishable, target);
  await writes.send(env);
  return { created, synced, unchanged, missing, removed, sectionWrites };
}

/**
 * Taken off the digital menu (#42). Like a night dropped from a schedule, a
 * drink on the website gets a draft marked `removed`, which Update website
 * takes off; one never published just goes. Its staged snapshot goes too, so
 * putting it back stages it again.
 */
async function dropOffMenuItems(env, pending, writes, items, publishable, target) {
  const kept = new Set(publishable);
  const offMenu = items.filter(
    (item) => !kept.has(item) && item.sanityId && item.publishSnapshots?.[target],
  );
  if (!offMenu.length) return [];
  const ids = offMenu.map((item) => item.sanityId);
  const live = new Set((await sanityQuery(env, "production", "*[_id in $ids]._id", { ids })) || []);
  for (const item of offMenu) {
    const id = item.sanityId;
    const { [target]: _staged, ...snapshots } = item.publishSnapshots;
    writes.add(live.has(id) ? { patch: { id, set: { removed: true } } } : { delete: { id } }, () =>
      pending.item(item._id, {
        publishSnapshots: snapshots,
        ...(live.has(id) ? {} : { sanityId: "" }),
      }),
    );
  }
  return offMenu.map((item) => ({ id: item._id, name: item.name, sanityId: item.sanityId }));
}

/**
 * After a release, mark live snapshots as matching the preview. Pass `sanityIds`
 * to limit it to the menu items that were actually published.
 */
export async function copyPreviewSnapshotsToProduction(env, { sanityIds } = {}) {
  const { items, repo } = await loadMenuTree(env);
  const pending = pendingWrites();
  let copied = 0;
  for (const item of items) {
    const preview = item.publishSnapshots?.preview;
    if (!preview) continue;
    if (sanityIds && !sanityIds.has(item.sanityId)) continue;
    const next = recordTargetSnapshot(
      item.publishSnapshots,
      "production",
      preview.payload || {},
    );
    if (preview.hash) next.production.hash = preview.hash;
    pending.item(item._id, { publishSnapshots: next });
    copied += 1;
  }
  await pending.flush(repo);
  return { copied };
}
