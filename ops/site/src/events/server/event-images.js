/**
 * Event photos go straight to Sanity (#183): one check for every upload, so
 * the main image, a night's flyer and gallery photos take the same files.
 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function refuse(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

/** { bytes, filename, contentType } from an upload form, or a 400. */
export async function readImageUpload(form, fallbackName = "event.jpg") {
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    refuse("Image file is required.");
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) refuse("Use a JPEG, PNG, WebP, or GIF image.");
  if (file.size > MAX_IMAGE_BYTES) refuse("Image must be 20MB or smaller.");
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) refuse("Image must be 20MB or smaller.");
  return { bytes, filename: file.name || fallbackName, contentType };
}
