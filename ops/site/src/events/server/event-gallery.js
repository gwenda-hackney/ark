/**
 * A series' gallery on the website: the photos in its Drive "gallery" folder,
 * copied into Sanity when the series is staged (event-publish.js).
 *
 * Each photo becomes a Sanity asset named after its Drive id and modified
 * time, so a photo is uploaded once and an edited one is uploaded again.
 * Uploads are capped per request (Cloudflare allows 50 outbound calls); a
 * bigger gallery finishes over the next website jobs.
 *
 * Drive has no change feed, so ops records which galleries are staged
 * (site.gallery_staged) and the Drive endpoints forget an event when its
 * gallery changes. Photos added in Drive directly show after the next save,
 * or when someone opens the event's Images tab.
 *
 * A night's photos go in a subfolder of the gallery named by its date
 * (2026-10-02). They show on the series gallery too, marked with that date,
 * and the night's page shows its own (#30).
 */
import { environmentOf, readState, writeState } from "../../../../../shared/config.js";
import {
  GALLERY_FOLDER_NAME,
  downloadDriveThumbnail,
  findNamedFolder,
  isDriveImage,
  listDriveChildren,
  listDriveImages,
  mapDriveImage,
} from "../../platform/google-drive.js";
import {
  PREVIEW,
  sanityQuery,
  sanityRenameImageAsset,
  sanityUploadImage,
} from "../../platform/sanity.js";

/**
 * On in dev; production waits until the website gallery has been checked on
 * a phone (#30). Off, nothing is copied.
 */
export function galleryEnabled(env) {
  return environmentOf(env) === "dev";
}
const NIGHT_FOLDER = /^\d{4}-\d{2}-\d{2}$/;
/** New photos uploaded per request. */
export const GALLERY_UPLOADS_PER_RUN = 4;
/** Longest edge of the copy sent to Sanity (Drive thumbnails go up to 1600). */
const GALLERY_EDGE = 1600;
const STAGED_KEY = "site.gallery_staged";

export function galleryAssetFilename(file) {
  const stamp = String(file?.modifiedTime || "").replace(/\D/g, "");
  return `drive-${file.id}${stamp ? `-${stamp}` : ""}`;
}

/** Changes whenever a photo is added, removed, moved or edited. */
export function galleryFingerprint(files) {
  return (files || [])
    .map((file) => `${file.id}:${file.modifiedTime || ""}:${file.date || ""}`)
    .join("|");
}

function parseStaged(text) {
  try {
    const parsed = text ? JSON.parse(text) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** `{ [eventId]: fingerprint }` of galleries already on the preview. */
export async function readGalleryStaged(env) {
  return parseStaged(
    await readState(env, "ops", STAGED_KEY, environmentOf(env)).catch(() => ""),
  );
}

async function writeGalleryStaged(env, staged) {
  await writeState(env, "ops", STAGED_KEY, environmentOf(env), JSON.stringify(staged));
}

export async function recordGalleryStaged(env, eventId, fingerprint) {
  const staged = await readGalleryStaged(env);
  const id = String(eventId);
  if (staged[id] === fingerprint) return;
  await writeGalleryStaged(env, { ...staged, [id]: fingerprint });
}

/** The gallery changed in ops: stage the event again. */
export async function forgetGalleryStaged(env, eventId) {
  const staged = await readGalleryStaged(env);
  const id = String(eventId);
  if (!(id in staged)) return;
  const next = { ...staged };
  delete next[id];
  await writeGalleryStaged(env, next);
}

/** The event has a Drive folder whose gallery is not staged yet. */
export function galleryBehind(event, staged = {}) {
  return Boolean(event?.driveFolderId) && !(String(event.id) in staged);
}

/** What's staged, or null while the gallery is off (nothing to copy). */
export async function readGalleryStagedIfOn(env) {
  return galleryEnabled(env) ? readGalleryStaged(env) : null;
}

/**
 * Every gallery photo, newest first, without creating any folder: the
 * gallery's own (`date` "") and each night's dated subfolder.
 */
export async function listGalleryFiles(env, event) {
  if (!event?.driveFolderId) return [];
  const folder = findNamedFolder(
    await listDriveChildren(env, event.driveFolderId),
    GALLERY_FOLDER_NAME,
  );
  if (!folder?.id) return [];
  const children = await listDriveChildren(env, folder.id);
  const files = children.filter(isDriveImage).map((file) => ({ ...mapDriveImage(file), date: "" }));
  for (const night of children.filter((file) => NIGHT_FOLDER.test(file?.name || "") && !isDriveImage(file))) {
    for (const file of await listDriveImages(env, night.id)) files.push({ ...file, date: night.name });
  }
  const added = (file) => file.createdTime || file.modifiedTime || "";
  return files.sort((a, b) => added(b).localeCompare(added(a)) || a.name.localeCompare(b.name));
}

function galleryImage(file, assetId) {
  return {
    _type: "image",
    _key: file.id,
    alt: "",
    driveFileId: file.id,
    // A night's photo: its page shows it as well as the series.
    ...(file.date ? { date: file.date } : {}),
    asset: { _type: "reference", _ref: assetId },
  };
}

/**
 * Sanity images for the gallery. `complete` is false when some photos wait
 * for the next run; the gallery then shows the ones uploaded so far.
 */
export async function syncGalleryImages(
  env,
  files,
  {
    query = sanityQuery,
    upload = sanityUploadImage,
    rename = sanityRenameImageAsset,
    download = downloadDriveThumbnail,
    maxUploads = GALLERY_UPLOADS_PER_RUN,
  } = {},
) {
  if (!files.length) return { images: [], complete: true };
  const names = files.map(galleryAssetFilename);
  const rows =
    (await query(
      env,
      PREVIEW,
      `*[_type == "sanity.imageAsset" && originalFilename in $names]{ _id, originalFilename }`,
      { names },
    )) || [];
  const known = new Map(rows.map((row) => [row.originalFilename, row._id]));
  const images = [];
  let uploads = 0;
  let complete = true;
  for (const file of files) {
    const filename = galleryAssetFilename(file);
    let assetId = known.get(filename);
    if (!assetId) {
      if (uploads >= maxUploads) {
        complete = false;
        continue;
      }
      uploads += 1;
      const photo = await download(env, file.id, { size: GALLERY_EDGE });
      const asset = await upload(env, photo.bytes, {
        filename,
        contentType: photo.contentType || file.mimeType || "image/jpeg",
      });
      if (!asset?._id) continue;
      assetId = asset._id;
      if (asset.originalFilename !== filename) await rename(env, assetId, filename);
    }
    images.push(galleryImage(file, assetId));
  }
  return { images, complete };
}
