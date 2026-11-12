import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { readImageUpload } from "../../../src/platform/image-upload.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { addGalleryPhotos, getGallery, orderGallery } from "../../../src/venue/server/venue-gallery.js";

/** The venue's gallery (#291), in its order, and where it stands on the website. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ ok: true, ...(await getGallery(context.env)) });
});

/**
 * Add a photo at the top of the gallery (a form: `file`, and optionally
 * `description` and `menu`); it goes on the website as a saved event does.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const form = await context.request.formData();
  const upload = await readImageUpload(form, "photo.jpg");
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  const result = await addGalleryPhotos(
    context.env,
    { ...upload, description: String(form.get("description") ?? ""), menu: String(form.get("menu") ?? "") },
    { by: by || "" },
  );
  return jsonResponse({ ok: true, ...result });
});

/** Put the gallery in a new order: `{ keys }`, every photo's key, first first. */
export const onRequestPut = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || !Array.isArray(body.keys)) return jsonResponse({ error: "Send the photos' order as keys." }, 400);
  return jsonResponse({ ok: true, ...(await orderGallery(context.env, body.keys)) });
});
