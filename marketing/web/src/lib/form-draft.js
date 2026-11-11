/**
 * A form's answers kept in the tab while someone fills it in, and put back
 * by the links in its emails (#240): the play or party form reads them
 * (scripts/contact-form.js), and /contact/verify and /contact/edit write
 * the answers the forms API sends back, so the form opens filled in.
 */
import { slugFromFormPath } from "./form-paths";

const SLUG = /^[a-z0-9-]+$/i;

/** Where a form's answers live in sessionStorage; empty without a form. */
export function formDraftKey(slug) {
  return slug ? `gwenda-form:${slug}` : "";
}

/**
 * The form a link's token is for, read from the token's own payload (the
 * part before the dot, base64url JSON); empty when it can't be read.
 *
 * @param {string | null | undefined} token
 */
export function slugFromToken(token) {
  try {
    const payload = String(token || "").split(".")[0];
    if (!payload) return "";
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad =
      padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = JSON.parse(atob(padded + pad));
    const slug = String(json?.slug || "").trim();
    return SLUG.test(slug) ? slug : "";
  } catch {
    return "";
  }
}

/**
 * Put a form's answers back in the tab, for the form at `formPath` to open
 * with. Nothing happens without a form, answers, or storage.
 *
 * @param {string | null | undefined} formPath
 * @param {Record<string, unknown> | null | undefined} answers
 * @param {Storage | undefined} [storage]
 */
export function seedFormDraft(
  formPath,
  answers,
  storage = globalThis.sessionStorage,
) {
  if (!formPath || !storage) return;
  const slug = slugFromFormPath(formPath);
  if (!slug || !SLUG.test(slug)) return;
  if (!answers || typeof answers !== "object") return;
  try {
    storage.setItem(
      formDraftKey(slug),
      JSON.stringify({
        answers,
        pending: null,
        result: null,
        savedAt: Date.now(),
      }),
    );
  } catch {
    /* the tab's storage is full or shut: the form opens empty */
  }
}
