import {
  PUBLISH_SNAPSHOTS_FIELD,
  photoFingerprint,
  projectionHash,
  recordTargetSnapshot,
  sanityPatchFromProjection,
  serializePublishSnapshots,
  websiteProjection,
} from "../../inventory/server/reconcile.js";
import {
  digitalSectionId,
  hasDigitalPlacement,
} from "../../menu/server/menu-placements.js";
import { flattenMenuSections } from "../../menu/menu-sections.js";
import { loadMenuTree } from "../../menu/server/menu-store.js";
import { baserowFetch, updateRow } from "../../../../../shared/baserow.js";
import {
  PREVIEW,
  sanityMutate,
  sanityQuery,
  sanityUploadImage,
} from "../../platform/sanity.js";

/** Sortable Sanity orderRank from Baserow numeric Order (create only). */
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

async function persistItemLinkAndSnapshot(env, tables, item, target, payload, sanityId) {
  const next = recordTargetSnapshot(item.publishSnapshots, target, payload);
  const fields = {
    [PUBLISH_SNAPSHOTS_FIELD]: serializePublishSnapshots(next),
  };
  if (!item.sanityId && sanityId) fields["Sanity ID"] = sanityId;
  await updateRow(env, tables.items, item._id, fields);
}

async function persistSectionLink(env, tables, section, sanityId) {
  if (section.sanityId === sanityId) return;
  await updateRow(env, tables.sections, section._id, { "Sanity ID": sanityId });
  section.sanityId = sanityId;
}

async function assertPublishSnapshotsField(env, tableId) {
  const fields = await baserowFetch(
    env,
    `/api/database/fields/table/${tableId}/`,
  );
  const names = Array.isArray(fields) ? fields.map((field) => field.name) : [];
  if (names.includes(PUBLISH_SNAPSHOTS_FIELD)) return;
  const error = new Error(
    "Baserow Menu Items is missing the Publish snapshots field. Run npm run setup:baserow-ops.",
  );
  error.status = 503;
  throw error;
}

async function createdDocId(result) {
  const id = result?.results?.[0]?.id;
  return typeof id === "string" && id ? id : null;
}

/**
 * Ensure every Baserow section exists in Sanity; return map of Baserow id → Sanity id.
 * Parents are walked before children via flattenMenuSections.
 * Already-linked sections are left as-is (item publish carries section refs).
 */
async function ensureSanitySections(env, tables, sections) {
  const flat = flattenMenuSections(sections);
  const byBaserowId = new Map();
  let writes = 0;

  for (const section of flat) {
    const slug =
      section.slug || slugifySection(section.title, `section-${section._id}`);
    const parentSanityId = section.parentId
      ? byBaserowId.get(String(section.parentId))
      : null;

    if (section.sanityId) {
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

    await persistSectionLink(env, tables, section, sanityId);
    byBaserowId.set(String(section._id), sanityId);
  }

  return { byBaserowId, writes };
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
 * Push guest-facing fields from Baserow ops → Sanity drafts (the preview).
 * Creates missing sections/items. Recipes / method / glass stay in Baserow only.
 * `target` names the publish snapshot this records.
 */
export async function syncOpsMenuToSanity(env, { target = "preview" } = {}) {
  const { items, sections, tables } = await loadMenuTree(env);
  await assertPublishSnapshotsField(env, tables.items);

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
    await ensureSanitySections(env, tables, [...withAncestors.values()]);

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
      if (!item.sanityId) {
        await updateRow(env, tables.items, item._id, { "Sanity ID": sanityId });
      }
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
      await persistItemLinkAndSnapshot(
        env,
        tables,
        item,
        target,
        payload,
        sanityId,
      );
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

    await persistItemLinkAndSnapshot(
      env,
      tables,
      item,
      target,
      payload,
      sanityId,
    );
    synced.push({ id: item._id, name: item.name, sanityId });
  }

  const removed = await dropOffMenuItems(env, tables, items, publishable, target);
  return { created, synced, unchanged, missing, removed, sectionWrites };
}

/**
 * Taken off the digital menu (#42). Like a night dropped from a schedule, a
 * drink on the website gets a draft marked `removed`, which Update website
 * takes off; one never published just goes. Its staged snapshot goes too, so
 * putting it back stages it again.
 */
async function dropOffMenuItems(env, tables, items, publishable, target) {
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
    await updateRow(env, tables.items, item._id, {
      [PUBLISH_SNAPSHOTS_FIELD]: serializePublishSnapshots(snapshots),
      ...(live.has(item.sanityId) ? {} : { "Sanity ID": "" }),
    });
  }
  return offMenu.map((item) => ({ id: item._id, name: item.name, sanityId: item.sanityId }));
}

/**
 * After a release, mark live snapshots as matching the preview. Pass `sanityIds`
 * to limit it to the menu items that were actually published.
 */
export async function copyPreviewSnapshotsToProduction(env, { sanityIds } = {}) {
  const { items, tables } = await loadMenuTree(env);
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
    await updateRow(env, tables.items, item._id, {
      [PUBLISH_SNAPSHOTS_FIELD]: serializePublishSnapshots(next),
    });
    copied += 1;
  }
  return { copied };
}
