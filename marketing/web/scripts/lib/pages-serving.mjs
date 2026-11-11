/**
 * How Cloudflare Pages serves a build (#240): which addresses run Pages
 * Functions (dist/_routes.json) and how long a browser may keep each kind of
 * file (dist/_headers). scripts/write-build-headers.mjs writes both.
 *
 * The live site is public, so a page that is a file in the build needs no
 * Function: only the Functions' own addresses run them, and every other page
 * comes straight from Cloudflare's asset cache. The dev website and the
 * previews are password-gated by functions/_middleware.js, so there every
 * address still runs it.
 */
import { readdirSync } from "node:fs";

/**
 * The live site's build (web-promote.yml): production settings, and not
 * production's preview. Anything else, a local build included, keeps every
 * address on the gate.
 * @param {Record<string, string | undefined>} env
 */
export function isLiveBuild(env = process.env) {
  return env.SITE_ENV === "production" && env.PUBLIC_IS_PREVIEW === "false";
}

/** A Functions file: a route handler, not a test or a helper folder (`_lib`). */
const isRouteEntry = (entry) =>
  !entry.name.startsWith("_") &&
  (entry.isDirectory() ||
    (/\.(m?js|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)));

/**
 * The addresses functions/ answers, one rule per top-level entry: a folder is
 * everything under it (`/api/*`), a file its own address (`/health`).
 *
 * functions/_middleware.js is left out on purpose: on the live site a page
 * from the build gives it nothing to do (the gate is open there, the write
 * freeze is for /api/, Sentry watches Functions' own code), so those pages
 * skip it. Anything under these rules still runs it first.
 * @param {string} functionsDir
 */
export function functionRoutes(functionsDir) {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter(isRouteEntry)
    .map((entry) => {
      if (entry.isDirectory()) return `/${entry.name}/*`;
      const name = entry.name.replace(/\.(m?js|ts)$/, "");
      if (name === "index") return "/";
      return name.startsWith("[") ? "/*" : `/${name}`;
    })
    .sort();
}

/**
 * Pages in the build that sit under a Functions folder: What's on's list is
 * built, and functions/whats-on/[[path]].js only passes it on
 * (resolveEventPage answers null for it).
 */
export const BUILT_UNDER_FUNCTIONS = ["/whats-on/"];

/**
 * dist/_routes.json. Live: the Functions' own addresses. Elsewhere: all of
 * them, for the gate.
 * @param {{ live: boolean, functionsDir: string }} options
 */
export function pagesRoutes({ live, functionsDir }) {
  if (!live) {
    return {
      version: 1,
      description: "Gated site: every address runs functions/_middleware.js.",
      include: ["/*"],
      exclude: [],
    };
  }
  return {
    version: 1,
    description:
      "Live site: Functions only where they answer; built pages straight from the asset cache.",
    include: functionRoutes(functionsDir),
    exclude: BUILT_UNDER_FUNCTIONS,
  };
}

/**
 * Whether Pages sends `pathname` to a `_routes.json` rule, as Cloudflare
 * matches them (wrangler's templates/pages-dev-util.ts): `*` is anything, a
 * rule ending in `/*` also matches the folder itself, and a trailing slash is
 * optional.
 * @param {string} pathname
 * @param {string} rule
 */
export function matchesRoute(pathname, rule) {
  let pattern;
  if (rule === "/" || rule === "/*") pattern = rule;
  else if (rule.endsWith("/*")) pattern = `${rule.slice(0, -2)}(/*)?`;
  else if (rule.endsWith("/")) pattern = `${rule.slice(0, -1)}(/)?`;
  else if (rule.endsWith("*")) pattern = rule;
  else pattern = `${rule}(/)?`;
  return new RegExp(
    `^${pattern.replaceAll(".", "\\.").replaceAll("*", ".*")}$`,
  ).test(pathname);
}

/** Whether a request for `pathname` runs Pages Functions under `routes`. */
export function runsFunctions(routes, pathname) {
  if (routes.exclude.some((rule) => matchesRoute(pathname, rule))) return false;
  return routes.include.some((rule) => matchesRoute(pathname, rule));
}

/**
 * How long a browser keeps a page: a minute, so the page Astro prefetches on
 * hover is the one the router then shows, without asking again. Private on a
 * gated site, where only a signed-in browser may keep it.
 * @param {boolean} live
 */
export function pageCacheControl(live) {
  return `${live ? "public" : "private"}, max-age=60`;
}

/**
 * dist/_headers. A page is any address ending in a slash (Astro builds each
 * page as a folder's index.html, and Pages sends `/bar` on to `/bar/`), so
 * its rule never overlaps the hashed files under /_astro/, which never
 * change and are kept for a year. Two rules setting one header on the same
 * address would be joined with a comma.
 * @param {{ version: string, sha?: string, live: boolean }} options
 */
export function headersFile({ version, sha = "", live }) {
  const page = pageCacheControl(live);
  return `/*
  X-Gwenda-Version: ${version}
  X-Gwenda-Build-Sha: ${sha}

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/_astro/logo.*
  X-Robots-Tag: noimageindex

/
  Cache-Control: ${page}

/*/
  Cache-Control: ${page}
`;
}
