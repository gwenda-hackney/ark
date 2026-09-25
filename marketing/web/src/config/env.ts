/** Set at build time — true for the staging Pages project (main branch). */
export const isStaging = import.meta.env.PUBLIC_IS_STAGING === "true";

/** Address of a non-live build (prod's preview, or the dev website). */
export const stagingOrigin =
  import.meta.env.PUBLIC_SITE_ORIGIN || "https://gwenda-staging.pages.dev";
