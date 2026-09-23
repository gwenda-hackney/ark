import { jsonResponse, withApiHandler } from "../../../_lib/http.js";
import { ensureEventGalleryFolder } from "../../../_lib/event-store.js";
import {
  isDriveImage,
  listDriveChildren,
  listDriveImages,
  uploadDriveFile,
} from "../../../_lib/google-drive.js";

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
  return children.filter(isDriveImage).length;
}

export const onRequestGet = withApiHandler(async (context) => {
  const id = eventId(context);
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const { event, gallery } = await ensureEventGalleryFolder(context.env, id);
  const [files, outsideGallery] = await Promise.all([
    listDriveImages(context.env, gallery.id),
    imagesOutsideGallery(context.env, event),
  ]);
  return jsonResponse(libraryPayload(event, gallery, files, outsideGallery));
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
  const uploaded = await uploadDriveFile(context.env, {
    name: file.name || "event.jpg",
    parentId: gallery.id,
    bytes,
    contentType,
  });
  const files = await listDriveImages(context.env, gallery.id);
  return jsonResponse({
    ok: true,
    file: uploaded,
    ...libraryPayload(event, gallery, files),
  });
});
