/**
 * Each environment's website, from a fixed list (never from a request), so it
 * is safe to work out rather than configure.
 */
import { environmentOf, isLocalMachine } from "./config-db.js";

const SITES = {
  production: { live: "https://gwenda.co.uk", preview: "https://gwenda-staging.pages.dev" },
  staging: { live: "https://gwenda-staging.pages.dev", preview: "https://gwenda-staging.pages.dev" },
  dev: {
    live: "https://gwenda-web-dev.pages.dev",
    preview: "https://preview.gwenda-web-dev.pages.dev",
  },
};

/** npm run web:dev:live / npm run web:dev */
const MACHINE = { live: "http://localhost:4322", preview: "http://localhost:4321" };

/** The website and its preview for the environment this runtime belongs to. */
export function websiteUrls(env = {}) {
  if (isLocalMachine(env)) return { ...MACHINE };
  return { ...SITES[environmentOf(env)] };
}
