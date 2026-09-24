import { withApiHandler } from "../../../../_lib/http.js";
import { ensureEventGalleryFolder } from "../../../../_lib/event-store.js";
import {
  downloadDriveFile,
  downloadDriveThumbnail,
  getDriveFile,
} from "../../../../_lib/google-drive.js";

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
  const parents = Array.isArray(meta?.parents) ? meta.parents : [];
  if (!gallery.id || !parents.includes(gallery.id)) {
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
