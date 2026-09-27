import { isLocalOps, runsOnMachine } from "../../../platform/sanity.js";

/** The website and its preview, for the Website page's links. */
export function siteUrls(env = {}) {
  if (runsOnMachine(env)) {
    // npm run web:dev:live / npm run web:dev
    return { live: "http://localhost:4322", preview: "http://localhost:4321" };
  }
  if (isLocalOps(env)) {
    return {
      live: "https://gwenda-web-dev.pages.dev",
      preview: "https://preview.gwenda-web-dev.pages.dev",
    };
  }
  return { live: "https://gwenda.co.uk", preview: "https://preview.gwenda-blue.pages.dev" };
}
