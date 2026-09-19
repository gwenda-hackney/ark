/** Public contact URLs for Sanity-driven forms (not /api/forms). */

export const FORM_PUBLIC_BASE = "/contact";
export const FORM_VERIFY_PATH = "/contact/verify";
export const FORM_EDIT_PATH = "/contact/edit";
/** Play form slug — drives turntable layout. */
export const PLAY_FORM_SLUG = "play";

const RESERVED_SLUGS = new Set(["verify", "edit"]);

export function isReservedFormSlug(slug) {
  return RESERVED_SLUGS.has(String(slug || "").trim());
}

export function formPublicPath(slug) {
  const clean = String(slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean || isReservedFormSlug(clean)) return FORM_PUBLIC_BASE;
  return `${FORM_PUBLIC_BASE}/${encodeURIComponent(clean)}`;
}

export function formSubmittedPath(slug) {
  const base = formPublicPath(slug);
  if (base === FORM_PUBLIC_BASE) return base;
  return `${base}/submitted`;
}

/** Parse `/contact/<slug>` (and legacy `/forms/<slug>`) into a slug. */
export function slugFromFormPath(formPath) {
  const raw = String(formPath || "").trim();
  const match = raw.match(/^\/(?:contact|forms)\/([a-z0-9-]+)/i);
  return match?.[1] || "";
}
