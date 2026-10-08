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

async function resolveSanityItemId(env, item) {
  if (item.sanityId) {
    const exists = await sanityQuery(
      env,
      PREVIEW,
      `*[_id == $id][0]._id`,
      { id: item.sanityId },
    );
    if (exists) return exists;
  }
  const found = await sanityQuery(
    env,
    PREVIEW,
    `*[_type == "menuItem" && name == $name && !(_id in path("drafts.**"))][0]._id`,
    { name: item.name },
  );
  return found || null;
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

async function createdDocId(result) {
  const id = result?.results?.[0]?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Ensure every ops section exists in Sanity; return map of ops id → Sanity id.
 * Parents are walked before children via flattenMenuSections.
 * Sections already linked get a rename, subtitle or move patched in
 * (linkedSectionPatch); before, a rename in ops never reached the website.
 */
async function ensureSanitySections(env, pending, sections) {
  const flat = flattenMenuSections(sections);
  const byBaserowId = new Map();
  let writes = 0;

  const linkedIds = flat.map((s) => s.sanityId).filter(Boolean);
  const linked = new Map(
    (linkedIds.length
      ? (await sanityQuery(
          env,
          PREVIEW,
          `*[_type == "menuSection" && _id in $ids]{_id, title, subtitle, "parent": parent._ref}`,
          { ids: linkedIds },
        )) || []
      : []
    ).map((doc) => [doc._id, doc]),
  );

  for (const section of flat) {
    const slug =
      section.slug || slugifySection(section.title, `section-${section._id}`);
    const parentSanityId = section.parentId
      ? byBaserowId.get(String(section.parentId))
      : null;

    if (section.sanityId) {
      const current = linked.get(section.sanityId);
      const patch = current && linkedSectionPatch(section, current, parentSanityId);
      if (patch) {
        await sanityMutate(env, [{ patch: { id: section.sanityId, ...patch } }]);
        writes += 1;
      }
      byBaserowId.set(String(section._id), section.sanityId);
      continue;
    }

    let sanityId = await sanityQuery(
      env,
      PREVIEW,
      `*[_type == "menuSection" && slug.current == $slug && !(_id in path("drafts.**"))][0]._id`,
      { slug },
    );

    const fields = {
      title: section.title || slug,
      slug: { _type: "slug", current: slug },
      orderRank: orderRankFromOrder(section.orderRank, "section"),
      ...(section.subtitle ? { subtitle: section.subtitle } : {}),
      ...(parentSanityId
        ? { parent: { _type: "reference", _ref: parentSanityId } }
        : {}),
    };
    const unset = [];
    if (!section.subtitle) unset.push("subtitle");
    if (!parentSanityId) unset.push("parent");

    if (sanityId) {
      await sanityMutate(env, [
        {
          patch: {
            id: sanityId,
            set: {
              title: fields.title,
              slug: fields.slug,
              ...(section.subtitle ? { subtitle: section.subtitle } : {}),
              ...(parentSanityId
                ? { parent: { _type: "reference", _ref: parentSanityId } }
                : {}),
            },
            ...(unset.length ? { unset } : {}),
          },
        },
      ]);
      writes += 1;
    } else {
      const created = await sanityMutate(env, [
        { create: { _type: "menuSection", ...fields } },
      ]);
      sanityId = await createdDocId(created);
      if (!sanityId) {
        const error = new Error(
          `Failed to create Sanity section "${section.title}".`,
        );
        error.status = 502;
        throw error;
      }
      writes += 1;
    }

    persistSectionLink(pending, section, sanityId);
    byBaserowId.set(String(section._id), sanityId);
  }

  return { byBaserowId, writes };
}

/**
 * What a section already on the website needs so it matches ops: a rename,
 * a new subtitle or a move under another chapter. Null when it matches.
 * The slug stays, so links to a chapter keep working after a rename.
 */
export function linkedSectionPatch(section, current, parentSanityId) {
  const title = section.title || "";
  const subtitle = section.subtitle || "";
  const parent = parentSanityId || null;
  const set = {};
  const unset = [];
  if (title && title !== (current.title || "")) set.title = title;
  if (subtitle !== (current.subtitle || "")) {
    if (subtitle) set.subtitle = subtitle;
    else unset.push("subtitle");
  }
  if (parent !== (current.parent || null)) {
    if (parent) set.parent = { _type: "reference", _ref: parent };
    else unset.push("parent");
  }
  if (!Object.keys(set).length && !unset.length) return null;
  return {
    ...(Object.keys(set).length ? { set } : {}),
    ...(unset.length ? { unset } : {}),
  };
}

function sectionRef(sanitySectionId) {
  if (!sanitySectionId) return null;
  return { _type: "reference", _ref: sanitySectionId };
}

async function createSanityItem(env, item, payload, sanitySectionId) {
  const { set, unset } = sanityPatchFromProjection(payload);
  const doc = {
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

  const created = await sanityMutate(env, [{ create: doc }]);
  const sanityId = await createdDocId(created);
  if (!sanityId) {
    const error = new Error(`Failed to create Sanity menu item "${item.name}".`);
    error.status = 502;
    throw error;
  }
  return sanityId;
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

  const { byBaserowId: sectionIds, writes: sectionWrites } =
    await ensureSanitySections(env, pending, [...withAncestors.values()]);

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

    let sanityId = await resolveSanityItemId(env, item);
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
      sanityId = await createSanityItem(
        env,
        item,
        payload,
        sanitySectionId,
      );
      persistItemLinkAndSnapshot(pending, item, target, payload, sanityId);
      created.push({ id: item._id, name: item.name, sanityId });
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
    await sanityMutate(env, [
      { patch: { id: sanityId, set, unset: [...unset, "removed"] } },
    ]);

    persistItemLinkAndSnapshot(pending, item, target, payload, sanityId);
    synced.push({ id: item._id, name: item.name, sanityId });
  }

  const removed = await dropOffMenuItems(env, pending, items, publishable, target);
  return { created, synced, unchanged, missing, removed, sectionWrites };
}

/**
 * Taken off the digital menu (#42). Like a night dropped from a schedule, a
 * drink on the website gets a draft marked `removed`, which Update website
 * takes off; one never published just goes. Its staged snapshot goes too, so
 * putting it back stages it again.
 */
async function dropOffMenuItems(env, pending, items, publishable, target) {
  const kept = new Set(publishable);
  const offMenu = items.filter(
    (item) => !kept.has(item) && item.sanityId && item.publishSnapshots?.[target],
  );
  if (!offMenu.length) return [];
  const ids = offMenu.map((item) => item.sanityId);
  const live = new Set((await sanityQuery(env, "production", "*[_id in $ids]._id", { ids })) || []);
  await sanityMutate(
    env,
    ids.map((id) => (live.has(id) ? { patch: { id, set: { removed: true } } } : { delete: { id } })),
  );
  for (const item of offMenu) {
    const { [target]: _staged, ...snapshots } = item.publishSnapshots;
    pending.item(item._id, {
      publishSnapshots: snapshots,
      ...(live.has(item.sanityId) ? {} : { sanityId: "" }),
    });
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
