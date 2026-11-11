/** The most letters the corner ribbon holds and stays legible. */
export const RIBBON_MAX_CHARS = 14;

/**
 * Which copy of the site this is, for the corner ribbon; null on the live
 * site, so a production build never has one.
 *
 * - A local dev server says "Local", or "Local · live" under
 *   `npm run web:dev:live` (published content).
 * - A hosted build says its PUBLIC_ENV_LABEL: the dev website "Dev" or
 *   "Dev · preview", a branch "Dev · <branch>"; prod's preview "Preview".
 *
 * `text` is what the ribbon says. A label too long for it ("Dev ·
 * feat-240-social-home") keeps its first part there; `label` is the whole
 * thing, for the tooltip and screen readers.
 *
 * @param {{
 *   dev?: boolean,
 *   isPreview?: boolean,
 *   envLabel?: string,
 *   sanityPerspective?: string,
 * }} [env]
 * @returns {{ label: string, text: string } | null}
 */
export function environmentRibbon({
  dev = false,
  isPreview = false,
  envLabel = "",
  sanityPerspective = "",
} = {}) {
  let label;
  if (dev) label = sanityPerspective === "published" ? "Local · live" : "Local";
  else if (isPreview) label = String(envLabel || "").trim() || "Preview";
  else return null;

  const text =
    label.length <= RIBBON_MAX_CHARS ? label : label.split("·")[0].trim();
  return { label, text };
}
