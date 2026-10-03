import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import {
  forgetGalleryStaged,
  galleryFingerprint,
  listGalleryFiles,
  readGalleryStaged,
} from "../../../../src/events/server/event-gallery.js";
import { ensureEventGalleryFolder } from "../../../../src/events/server/event-store.js";
import {
  ensureNamedChildFolder,
  findNamedFolder,
  isDriveImage,
  isHeroDriveFileName,
  listDriveChildren,
  listDriveImages,
  uploadDriveFile,
} from "../../../../src/platform/google-drive.js";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function eventId(context) {
  return decodeURIComponent(context.params?.id || "");
}

/** `?date=2026-10-02`: that night's photos, in its subfolder of the gallery (#30). */
function nightDate(context) {
  const date = new URL(context.request.url).searchParams.get("date") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function libraryPayload(event, gallery, files, outsideGallery = 0) {
  return {
    folder: {
      id: event.driveFolderId || "",
      url: event.driveFolderUrl || "",
    },
    gallery: {
      id: gallery.id || "",
      url: gallery.url || "",
    },
    outsideGallery,
    files,
  };
}

async function imagesOutsideGallery(env, event) {
  const children = await listDriveChildren(env, event.driveFolderId);
  return children.filter(
    (file) => isDriveImage(file) && !isHeroDriveFileName(file?.name),
  ).length;
}

/** The night's folder (made on upload only), or the gallery itself. */
async function photoFolder(env, gallery, date, { create = false } = {}) {
  if (!date) return gallery;
  if (create) return ensureNamedChildFolder(env, gallery.id, date);
  return findNamedFolder(await listDriveChildren(env, gallery.id), date);
}

export const onRequestGet = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const date = nightDate(context);
  const { event, gallery } = await ensureEventGalleryFolder(context.env, id);
  const folder = await photoFolder(context.env, gallery, date);
  const [files, outsideGallery, staged, all] = await Promise.all([
    folder?.id ? listDriveImages(context.env, folder.id) : [],
    imagesOutsideGallery(context.env, event),
    readGalleryStaged(context.env),
    listGalleryFiles(context.env, event),
  ]);
  // Photos added or removed in Drive itself: copy the gallery again.
  const was = staged[String(event.id)];
  if (was !== undefined && was !== galleryFingerprint(all)) {
    await forgetGalleryStaged(context.env, event.id);
  }
  return jsonResponse(libraryPayload(event, folder?.id ? { ...gallery, ...folder } : gallery, files, outsideGallery));
});

export const onRequestPost = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const form = await context.request.formData();
  const file = form.get("file");
  if (
    !file ||
    typeof file === "string" ||
    typeof file.arrayBuffer !== "function"
  ) {
    return jsonResponse({ error: "Image file is required." }, 400);
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return jsonResponse({ error: "Use a JPEG, PNG, WebP, or GIF image." }, 400);
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return jsonResponse({ error: "Image must be 12MB or smaller." }, 400);
  }
  const { event, gallery } = await ensureEventGalleryFolder(context.env, id);
  const folder = await photoFolder(context.env, gallery, nightDate(context), { create: true });
  const uploaded = await uploadDriveFile(context.env, {
    name: file.name || "event.jpg",
    parentId: folder.id,
    bytes,
    contentType,
  });
  const files = await listDriveImages(context.env, folder.id);
  await forgetGalleryStaged(context.env, event.id);
  return jsonResponse({
    ok: true,
    file: uploaded,
    ...libraryPayload(event, { ...gallery, ...folder }, files),
  });
});
