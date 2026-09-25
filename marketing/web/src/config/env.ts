/** Set at build time — true for a preview (prod's or dev's) and the dev website. */
export const isPreview = import.meta.env.PUBLIC_IS_PREVIEW === "true";

/** Address of a non-live build (prod's preview, or the dev website). */
export const previewOrigin =
  import.meta.env.PUBLIC_SITE_ORIGIN || "https://preview.gwenda-blue.pages.dev";
