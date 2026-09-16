import { baserowFetch, updateRow } from "./baserow.js";
import { loadMenuTree } from "./menu-store.js";
import {
  PUBLISH_SNAPSHOTS_FIELD,
  photoFingerprint,
  projectionHash,
  recordTargetSnapshot,
  sanityPatchFromProjection,
  serializePublishSnapshots,
  websiteProjection,
} from "./reconcile.js";
import {
  sanityDataset,
  sanityMutate,
  sanityQuery,
  sanityUploadImage,
} from "./sanity.js";

async function resolveSanityItemId(env, dataset, item) {
  if (item.sanityId) return item.sanityId;
  const found = await sanityQuery(
    env,
    dataset,
    `*[_type == "menuItem" && name == $name && !(_id in path("drafts.**"))][0]._id`,
    { name: item.name },
  );
  return found || null;
}

async function syncPhoto(env, dataset, item) {
  const url = item.image?.asset?.url;
  if (!url) return undefined;
  const response = await fetch(url);
  if (!response.ok) return undefined;
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const asset = await sanityUploadImage(env, dataset, bytes, {
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

async function persistLinkAndSnapshot(env, tables, item, target, payload, sanityId) {
  const next = recordTargetSnapshot(item.publishSnapshots, target, payload);
  const fields = {
    [PUBLISH_SNAPSHOTS_FIELD]: serializePublishSnapshots(next),
  };
  if (!item.sanityId && sanityId) fields["Sanity ID"] = sanityId;
  await updateRow(env, tables.items, item._id, fields);
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

/**
 * Push guest-facing fields from Baserow ops → Sanity (marketing site CMS).
 * Recipes / method / glass stay in Baserow only.
 */
export async function syncOpsMenuToSanity(env, { target = "staging" } = {}) {
  const dataset = sanityDataset(env, target);
  const { items, tables } = await loadMenuTree(env);
  await assertPublishSnapshotsField(env, tables.items);
  const publishable = items.filter((item) => item.onDigitalMenu !== false);

  const synced = [];
  const unchanged = [];
  const missing = [];

  for (const item of publishable) {
    const sanityId = await resolveSanityItemId(env, dataset, item);
    if (!sanityId) {
      missing.push(item.name);
      continue;
    }

    const payload = websiteProjection(item);
    const previous = item.publishSnapshots?.[target];
    const hashMatches = previous?.hash === projectionHash(payload);

    if (hashMatches) {
      if (!item.sanityId) {
        await updateRow(env, tables.items, item._id, { "Sanity ID": sanityId });
      }
      unchanged.push({ id: item._id, name: item.name, sanityId });
      continue;
    }

    const { set, unset } = sanityPatchFromProjection(payload);
    const photoChanged = previous?.payload?.photo !== photoFingerprint(item);

    if (photoChanged) {
      const url = item.image?.asset?.url;
      if (!url) {
        unset.push("image");
      } else {
        try {
          const image = await syncPhoto(env, dataset, item);
          if (image) set.image = image;
        } catch {
          // Keep previous Sanity image if upload fails.
        }
      }
    }

    await sanityMutate(env, dataset, [
      { patch: { id: sanityId, set, ...(unset.length ? { unset } : {}) } },
    ]);

    await persistLinkAndSnapshot(env, tables, item, target, payload, sanityId);
    synced.push({ id: item._id, name: item.name, sanityId });
  }

  return { dataset, synced, unchanged, missing };
}
