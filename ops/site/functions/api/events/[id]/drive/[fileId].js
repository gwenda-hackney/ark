import { jsonResponse, withApiHandler } from "../../../../../src/platform/http.js";
import { ensureEventGalleryFolder } from "../../../../../src/events/server/event-store.js";
import { forgetGalleryStaged } from "../../../../../src/events/server/event-gallery.js";
import {
  downloadDriveFile,
  downloadDriveThumbnail,
  getDriveFile,
  trashDriveFile,
} from "../../../../../src/platform/google-drive.js";

/** A photo in the event's gallery, or in one of its nights' folders (#30). */
async function inGallery(env, galleryId, meta) {
  const parents = Array.isArray(meta?.parents) ? meta.parents : [];
  if (!galleryId || !parents.length) return false;
  if (parents.includes(galleryId)) return true;
  const folder = await getDriveFile(env, parents[0]);
  return Array.isArray(folder?.parents) && folder.parents.includes(galleryId);
}

function params(context) {
  return {
    id: decodeURIComponent(context.params?.id || ""),
    fileId: decodeURIComponent(context.params?.fileId || ""),
  };
}

export const onRequestGet = withApiHandler(async (context) => {
  const { id, fileId } = params(context);
  if (!id || !fileId) {
    return new Response(JSON.stringify({ error: "Missing event or file id." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { gallery } = await ensureEventGalleryFolder(context.env, id);
  const meta = await getDriveFile(context.env, fileId);
  if (!(await inGallery(context.env, gallery.id, meta))) {
    return new Response(JSON.stringify({ error: "File not found for this event." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(context.request.url);
  const variant = String(url.searchParams.get("variant") || "thumb")
    .trim()
    .toLowerCase();
  const size = Number(url.searchParams.get("size") || 400);
  const downloaded =
    variant === "full"
      ? await downloadDriveFile(context.env, fileId)
      : await downloadDriveThumbnail(context.env, fileId, { size });

  return new Response(downloaded.bytes, {
    status: 200,
    headers: {
      "Content-Type": downloaded.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

/** Remove a photo: it goes to the Drive bin, and off the website on Update website. */
export const onRequestDelete = withApiHandler(async (context) => {
  const { id, fileId } = params(context);
  if (!id || !fileId) return jsonResponse({ error: "Missing event or file id." }, 400);
  const { event, gallery } = await ensureEventGalleryFolder(context.env, id);
  if (!(await inGallery(context.env, gallery.id, await getDriveFile(context.env, fileId)))) {
    return jsonResponse({ error: "File not found for this event." }, 404);
  }
  await trashDriveFile(context.env, fileId);
  await forgetGalleryStaged(context.env, event.id);
  return jsonResponse({ ok: true });
});
