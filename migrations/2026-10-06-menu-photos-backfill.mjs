/**
 * Drink photos from before they went straight to Sanity (#183): a Menu Items
 * photo that is still a Baserow file gets its Sanity asset id (Photo asset).
 *
 * Publishing the menu already copied most of them: a drink whose preview or
 * live snapshot recorded this file has it on its Sanity document, so that
 * asset is reused. The rest are uploaded now. The snapshots that recorded
 * the file then record the asset instead, so the photo doesn't look changed
 * to Update website.
 *
 * The Baserow files stay until the cleanup removes the column. After the ops
 * deploy, so ops reads the new field. Safe to run again: it only touches
 * drinks that haven't moved yet. Supports --dry-run (with --only).
 */
import {
  PUBLISH_SNAPSHOTS_FIELD,
  WEBSITE_TARGETS,
  parsePublishSnapshots,
  projectionHash,
  serializePublishSnapshots,
} from "../ops/site/src/inventory/server/reconcile.js";
import { parseImageAssetId } from "../shared/sanity-image.js";

export const app = "ops";
export const phase = "post";
export const about = "Drink photos from before #183: Photo asset for each Menu Items photo";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function firstFile(value) {
  const file = Array.isArray(value) ? value[0] : null;
  const url = text(file?.url);
  return url ? { name: text(file?.name), url } : null;
}

/** Drinks (ops "Menu Items" rows) whose photo is still a Baserow file. */
export function planPhotoBackfill(rows) {
  const drinks = [];
  for (const row of rows) {
    // Rows without a name aren't drinks (ops lists only named ones).
    if (!text(row.Name)) continue;
    const file = firstFile(row.Photo);
    if (!file || parseImageAssetId(text(row["Photo asset"]))) continue;
    drinks.push({
      id: row.id,
      name: text(row.Name),
      file,
      sanityId: text(row["Sanity ID"]).replace(/^drafts\./, ""),
      snapshots: parsePublishSnapshots(row[PUBLISH_SNAPSHOTS_FIELD]),
    });
  }
  return { drinks };
}

/**
 * The asset publishing made of this file, from the drink's Sanity documents
 * (`assetByDoc`: document id → image asset id). The preview shows the draft
 * (or the published document when there is none), the live site the
 * published one; only a target whose snapshot recorded this file counts.
 */
export function reusedAsset(drink, assetByDoc) {
  if (!drink.sanityId) return "";
  const recorded = (target) => drink.snapshots[target]?.payload?.photo === drink.file.url;
  const draft = `drafts.${drink.sanityId}`;
  const candidates = [];
  if (recorded("preview")) {
    candidates.push(assetByDoc.has(draft) ? assetByDoc.get(draft) : assetByDoc.get(drink.sanityId));
  }
  if (recorded("production")) candidates.push(assetByDoc.get(drink.sanityId));
  return candidates.find((id) => parseImageAssetId(id)) || "";
}

/** The snapshots, with each one that recorded the file recording the asset instead. */
export function snapshotsWithAsset(snapshots, fileUrl, asset) {
  let changed = false;
  const next = { ...snapshots };
  for (const target of WEBSITE_TARGETS) {
    const entry = snapshots[target];
    if (entry?.payload?.photo !== fileUrl) continue;
    const payload = { ...entry.payload, photo: asset };
    // A hash that was the payload's stays the payload's; any other is left as it was.
    const hash = entry.hash === projectionHash(entry.payload) ? projectionHash(payload) : entry.hash;
    next[target] = { ...entry, hash, payload };
    changed = true;
  }
  return changed ? next : null;
}

export async function up({ database, sanity, log, dryRun = false }) {
  const ops = await database("ops");
  const { drinks } = planPhotoBackfill(await ops.rows("Menu Items"));
  log(`${ops.label}: ${drinks.length} drink photos to move`);
  if (!drinks.length) return;

  const content = sanity();
  const ids = drinks.filter((drink) => drink.sanityId).flatMap((drink) => [drink.sanityId, `drafts.${drink.sanityId}`]);
  const assetByDoc = new Map();
  for (const doc of ids.length ? await content.query(`*[_id in $ids]{ _id, "asset": image.asset._ref }`, { ids }) : []) {
    if (doc?.asset) assetByDoc.set(doc._id, doc.asset);
  }

  const failures = [];
  const updates = [];
  for (const drink of drinks) {
    try {
      let asset = reusedAsset(drink, assetByDoc);
      const reused = Boolean(asset);
      if (!asset && !dryRun) {
        const res = await fetch(drink.file.url);
        if (!res.ok) throw new Error(`could not read ${drink.file.name || "the photo"} from Baserow (${res.status})`);
        const uploaded = await content.uploadImage(await res.arrayBuffer(), {
          filename: drink.file.name || `${drink.name}.jpg`,
          contentType: res.headers.get("content-type") || "image/jpeg",
        });
        if (!parseImageAssetId(uploaded?._id)) throw new Error("Sanity didn't take the photo");
        asset = uploaded._id;
      }
      log(`  ${drink.name}: ${reused ? "found in Sanity" : dryRun ? "to upload" : "uploaded"}`);
      if (!asset) continue;
      const snapshots = snapshotsWithAsset(drink.snapshots, drink.file.url, asset);
      updates.push({
        id: drink.id,
        "Photo asset": asset,
        ...(snapshots ? { [PUBLISH_SNAPSHOTS_FIELD]: serializePublishSnapshots(snapshots) } : {}),
      });
    } catch (error) {
      failures.push(`${drink.name}: ${error.message}`);
    }
  }
  if (!dryRun) await ops.updateRows("Menu Items", updates);

  if (failures.length) {
    throw new Error(`Some photos didn't move (run again to retry):\n  ${failures.join("\n  ")}`);
  }
}
