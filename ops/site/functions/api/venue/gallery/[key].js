import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { describeGalleryPhoto, removeGalleryPhoto } from "../../../../src/venue/server/venue-gallery.js";

const photoKey = (context) => decodeURIComponent(context.params?.key || "");

/** Say what a photo shows (`description`) and/or pin it to a menu board on home (`menu`). */
export const onRequestPatch = withApiHandler(async (context) => {
  const key = photoKey(context);
  if (!key) return jsonResponse({ error: "Missing photo." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Send the photo's description or menu board." }, 400);
  }
  try {
    return jsonResponse({ ok: true, ...(await describeGalleryPhoto(context.env, key, body)) });
  } catch (error) {
    // Each field's problem, so the page can put it under the field.
    if (error?.status === 400 && error.problems) {
      return jsonResponse({ error: error.message, problems: error.problems }, 400);
    }
    throw error;
  }
});

/** Take a photo out of the gallery: it leaves the website with the venue's details. */
export const onRequestDelete = withApiHandler(async (context) => {
  const key = photoKey(context);
  if (!key) return jsonResponse({ error: "Missing photo." }, 400);
  return jsonResponse({ ok: true, ...(await removeGalleryPhoto(context.env, key)) });
});
