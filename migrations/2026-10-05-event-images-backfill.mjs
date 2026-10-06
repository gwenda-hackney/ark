/**
 * Event photos from before #183 move to where ops now keeps them:
 *
 * - A series main image or a night's flyer that is still a Baserow file gets
 *   its Sanity asset id (Hero asset / Override asset). Ops already copied
 *   most of them as "ops-<file name>"; the rest are uploaded now.
 * - A series whose gallery is still in Drive gets it in ops (Events
 *   "Gallery"): every photo, full size, uploaded from the Drive original
 *   (staging only ever copied 1600px thumbnails). The photo keeps its Drive
 *   id as its key, and a night's photo its date.
 *
 * Reads Drive, never changes it. The Baserow files stay until the cleanup
 * removes their columns. After the ops deploy, so ops reads the new fields.
 * Safe to run again: it only touches what hasn't moved yet. Supports
 * --dry-run (with --only).
 */
import { listGalleryFiles } from "../ops/site/src/events/server/event-gallery.js";
import { downloadDriveFile } from "../ops/site/src/platform/google-drive.js";
import { parseImageAssetId } from "../shared/sanity-image.js";

export const app = "ops";
export const phase = "post";
export const about = "Event photos from before #183: asset ids for main images and flyers, galleries from Drive into ops";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function firstFile(value) {
  const file = Array.isArray(value) ? value[0] : null;
  const name = text(file?.name);
  return name ? { name, url: text(file?.url) } : null;
}

/** What still has to move: rows of the ops "Events" and "Event dates" tables. */
export function planImageBackfill({ events, nights }) {
  const heroes = [];
  const flyers = [];
  const galleries = [];
  for (const row of events) {
    // Rows without a name aren't events (ops lists only named ones).
    if (!text(row.Name)) continue;
    const file = firstFile(row["Main image"]);
    if (file && !parseImageAssetId(text(row["Hero asset"]))) heroes.push({ id: row.id, name: text(row.Name), file });
    if (!text(row.Gallery)) {
      galleries.push({ id: row.id, name: text(row.Name), driveFolderId: text(row["Drive folder id"]) });
    }
  }
  for (const row of nights) {
    const file = firstFile(row["Override image"]);
    if (file && !parseImageAssetId(text(row["Override asset"]))) flyers.push({ id: row.id, name: text(row.Name), file });
  }
  return { heroes, flyers, galleries };
}

/** Drive gallery files (newest first) and their Sanity assets → the Gallery column's photos. */
export function galleryFromDrive(files, assetByFileId) {
  return files
    .filter((file) => assetByFileId.has(file.id))
    .map((file) => ({
      key: file.id,
      asset: assetByFileId.get(file.id),
      date: file.date || "",
      added: file.createdTime || file.modifiedTime || "",
      source: `drive:${file.id}`,
    }));
}

/** The Sanity name ops gave a photo it copied from a Baserow file. */
const opsAssetName = (file) => `ops-${file.name}`;

export async function up({ env, processEnv, database, sanity, log, dryRun = false }) {
  const ops = await database("ops");
  const plan = planImageBackfill({ events: await ops.rows("Events"), nights: await ops.rows("Event dates") });
  log(
    `${ops.label}: ${plan.heroes.length} main images, ${plan.flyers.length} flyers, ${plan.galleries.length} galleries to move`,
  );
  if (!plan.heroes.length && !plan.flyers.length && !plan.galleries.length) return;

  const content = sanity();
  const runtime = { ...processEnv, SITE_ENV: env };
  const failures = [];

  // Main images and flyers: reuse the asset ops copied before, else upload the file.
  const files = [...plan.heroes, ...plan.flyers].map((item) => item.file);
  const names = [...new Set(files.map(opsAssetName))];
  const known = new Map();
  for (const row of names.length
    ? await content.query(`*[_type == "sanity.imageAsset" && originalFilename in $names]{ _id, originalFilename }`, {
        names,
      })
    : []) {
    known.set(row.originalFilename, row._id);
  }
  async function assetFor(file) {
    const name = opsAssetName(file);
    if (known.has(name)) return known.get(name);
    if (dryRun) return "";
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`could not read ${file.name} from Baserow (${res.status})`);
    const asset = await content.uploadImage(await res.arrayBuffer(), {
      filename: name,
      contentType: res.headers.get("content-type") || "image/jpeg",
    });
    if (!parseImageAssetId(asset?._id)) throw new Error(`Sanity didn't take ${file.name}`);
    known.set(name, asset._id);
    return asset._id;
  }

  for (const [items, table, column] of [
    [plan.heroes, "Events", "Hero asset"],
    [plan.flyers, "Event dates", "Override asset"],
  ]) {
    const updates = [];
    for (const item of items) {
      try {
        const reused = known.has(opsAssetName(item.file));
        const asset = await assetFor(item.file);
        log(`  ${item.name}: ${column} ${reused ? "found in Sanity" : dryRun ? "to upload" : "uploaded"}`);
        if (asset) updates.push({ id: item.id, [column]: asset });
      } catch (error) {
        failures.push(`${item.name}: ${error.message}`);
      }
    }
    if (!dryRun) await ops.updateRows(table, updates);
  }

  // Galleries: every Drive photo, full size, into the Gallery column.
  for (const item of plan.galleries) {
    try {
      const driveFiles = item.driveFolderId
        ? await listGalleryFiles(runtime, { id: item.id, driveFolderId: item.driveFolderId })
        : [];
      log(`  ${item.name}: gallery of ${driveFiles.length} photo${driveFiles.length === 1 ? "" : "s"}`);
      if (dryRun) continue;
      const assetByFileId = new Map();
      for (const file of driveFiles) {
        const { bytes, contentType } = await downloadDriveFile(runtime, file.id);
        const asset = await content.uploadImage(bytes, { filename: `drive-${file.id}`, contentType });
        if (!parseImageAssetId(asset?._id)) throw new Error(`Sanity didn't take ${file.name}`);
        assetByFileId.set(file.id, asset._id);
      }
      await ops.updateRows("Events", [
        { id: item.id, Gallery: JSON.stringify(galleryFromDrive(driveFiles, assetByFileId)) },
      ]);
    } catch (error) {
      failures.push(`${item.name} gallery: ${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Some photos didn't move (run again to retry):\n  ${failures.join("\n  ")}`);
  }
}
