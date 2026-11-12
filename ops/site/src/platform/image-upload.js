/**
 * Photos ops takes in (#183): one check for every upload, so an event's main
 * image, a night's flyer, gallery photos (an event's, the venue's) and an
 * artist's pictures take the same files; and the upload to Sanity, where the
 * photo's only copy lives.
 */
import { parseImageAssetId } from "../../../../shared/sanity-image.js";
import { sanityUploadImage } from "./sanity.js";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function refuse(message, status = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).status = status;
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

/**
 * Upload a photo to Sanity; returns its asset id. Sanity names an image by
 * the hash of its bytes, so the same photo uploaded twice is one asset.
 * @returns {Promise<string>}
 */
export async function uploadImage(env, { bytes, filename, contentType }) {
  const asset = await sanityUploadImage(env, bytes, { filename, contentType });
  if (!parseImageAssetId(asset?._id)) refuse("The photo didn't upload to Sanity.", 502);
  return asset._id;
}
