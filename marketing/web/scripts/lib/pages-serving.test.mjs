import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEventPage } from "../../functions/_lib/event-pages.js";
import {
  BUILT_UNDER_FUNCTIONS,
  headersFile,
  isLiveBuild,
  matchesRoute,
  pagesRoutes,
  runsFunctions,
} from "./pages-serving.mjs";

const functionsDir = resolve(import.meta.dirname, "../../functions");
const live = pagesRoutes({ live: true, functionsDir });
const gated = pagesRoutes({ live: false, functionsDir });

/** Pages that are files in the build. */
const BUILT_PAGES = [
  "/",
  "/bar",
  "/bar/",
  "/kitchen/",
  "/contact/",
  "/contact/play/",
  "/contact/party/submitted/",
  "/photos/",
  "/privacy/",
  "/acknowledgements/",
  "/whats-on",
  "/whats-on/",
  "/gate/",
  "/no-such-page",
  "/_astro/index.Bx1.css",
  "/robots.txt",
];

/** Addresses only a Function answers. */
const FUNCTION_ADDRESSES = [
  "/api/forms",
  "/api/forms/",
  "/api/subscribe",
  "/api/health/deep",
  "/api/whats-on/schedule",
  "/health",
  "/og/events/chez-pickle-2026-11-12",
  "/preview",
  "/preview/",
  "/whats-on/schedule",
  "/whats-on/chez-pickle/",
  "/whats-on/chez-pickle/2026-11-12/ticket/",
  "/whats-on/never-an-event",
];

describe("isLiveBuild", () => {
  it("is the live site's build only", () => {
    // web-promote.yml: production secrets, not a preview
    expect(
      isLiveBuild({ SITE_ENV: "production", PUBLIC_IS_PREVIEW: "false" }),
    ).toBe(true);
    // web.yml: production's preview, the dev website, a branch preview
    expect(
      isLiveBuild({ SITE_ENV: "production", PUBLIC_IS_PREVIEW: "true" }),
    ).toBe(false);
    expect(isLiveBuild({ SITE_ENV: "dev", PUBLIC_IS_PREVIEW: "true" })).toBe(
      false,
    );
    expect(isLiveBuild({ SITE_ENV: "dev", PUBLIC_IS_PREVIEW: "false" })).toBe(
      false,
    );
    // Not said: keep the gate
    expect(isLiveBuild({ SITE_ENV: "production" })).toBe(false);
    expect(isLiveBuild({})).toBe(false);
  });
});

describe("live site routes", () => {
  it("sends only the Functions' own addresses to Functions", () => {
    expect(live.include).toEqual([
      "/api/*",
      "/health",
      "/og/*",
      "/preview/*",
      "/whats-on/*",
    ]);
    expect(live.exclude).toEqual(["/whats-on/"]);
  });

  it.each(BUILT_PAGES)("serves %s from the build", (path) => {
    expect(runsFunctions(live, path)).toBe(false);
  });

  it.each(FUNCTION_ADDRESSES)("runs Functions for %s", (path) => {
    expect(runsFunctions(live, path)).toBe(true);
  });

  it("reaches every route handler in functions/", () => {
    const handlers = routeHandlers(functionsDir);
    expect(handlers.length).toBeGreaterThan(10);
    for (const { file, path } of handlers) {
      expect(runsFunctions(live, path), `${file} at ${path}`).toBe(true);
    }
  });

  it("leaves out only built pages the What's on Function passes on", async () => {
    for (const path of BUILT_UNDER_FUNCTIONS) {
      expect(await resolveEventPage({}, path)).toBeNull();
    }
  });

  it("is a _routes.json Pages accepts", () => {
    for (const routes of [live, gated]) {
      const rules = [...routes.include, ...routes.exclude];
      expect(routes.version).toBe(1);
      expect(routes.include.length).toBeGreaterThan(0);
      expect(rules.length).toBeLessThanOrEqual(100);
      for (const rule of rules) {
        expect(rule).toMatch(/^\//);
        expect(rule.length).toBeLessThanOrEqual(100);
      }
      // A rule ending in /* may not overlap another in the same list
      for (const list of [routes.include, routes.exclude]) {
        for (const splat of list.filter((rule) => rule.endsWith("/*"))) {
          const others = list.filter(
            (rule) => rule !== splat && rule.startsWith(splat.slice(0, -1)),
          );
          expect(others, splat).toEqual([]);
        }
      }
    }
  });
});

describe("gated site routes", () => {
  it("runs the gate on every address", () => {
    expect(gated.include).toEqual(["/*"]);
    expect(gated.exclude).toEqual([]);
    for (const path of [...BUILT_PAGES, ...FUNCTION_ADDRESSES]) {
      expect(runsFunctions(gated, path), path).toBe(true);
    }
  });
});

describe("matchesRoute", () => {
  it("matches as Cloudflare does", () => {
    expect(matchesRoute("/api", "/api/*")).toBe(true);
    expect(matchesRoute("/api/forms/edit", "/api/*")).toBe(true);
    expect(matchesRoute("/apis", "/api/*")).toBe(false);
    expect(matchesRoute("/health/", "/health")).toBe(true);
    expect(matchesRoute("/healthy", "/health")).toBe(false);
    expect(matchesRoute("/whats-on", "/whats-on/")).toBe(true);
    expect(matchesRoute("/whats-on/x", "/whats-on/")).toBe(false);
    expect(matchesRoute("/anything/at/all", "/*")).toBe(true);
  });
});

describe("headersFile", () => {
  const file = (options) =>
    headersFile({ version: "2026.11.11+abc1234", sha: "abc", ...options });

  it("keeps a live page a minute, publicly", () => {
    const headers = file({ live: true });
    for (const path of ["/", "/bar/", "/contact/play/submitted/"]) {
      expect(cacheControl(headers, path), path).toEqual(["public, max-age=60"]);
    }
  });

  it("keeps a gated page a minute, in the signed-in browser only", () => {
    const headers = file({ live: false });
    for (const path of ["/", "/bar/", "/whats-on/"]) {
      expect(cacheControl(headers, path), path).toEqual([
        "private, max-age=60",
      ]);
    }
  });

  it("keeps hashed build files for a year, never with a page's rule", () => {
    for (const live of [true, false]) {
      const headers = file({ live });
      for (const path of ["/_astro/index.Bx1.css", "/_astro/logo.Ab2.png"]) {
        expect(cacheControl(headers, path), path).toEqual([
          "public, max-age=31536000, immutable",
        ]);
      }
      // Other files keep Pages' own (revalidate each time)
      expect(cacheControl(headers, "/robots.txt")).toEqual([]);
      expect(cacheControl(headers, "/favicon.svg")).toEqual([]);
    }
  });

  it("still stamps the version on everything", () => {
    expect(file({ live: true })).toContain(
      "/*\n  X-Gwenda-Version: 2026.11.11+abc1234\n",
    );
  });
});

/**
 * Every file in functions/ that exports a request handler, with an address
 * it answers. The site-wide functions/_middleware.js is left out: on the
 * live site it runs only with these.
 */
function routeHandlers(dir) {
  const files = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((file) => /\.(m?js|ts)$/.test(file) && !/\.test\./.test(file))
    .filter((file) => file !== "_middleware.js");
  return files
    .filter((file) =>
      /export\s+(async\s+)?(function|const|let)\s+onRequest/.test(
        readFileSync(join(dir, file), "utf8"),
      ),
    )
    .map((file) => {
      const path = `/${file}`
        .replace(/\.(m?js|ts)$/, "")
        .replace(/\[\[?(\w+)\]?\]/g, "$1")
        .replace(/\/index$/, "")
        .replace(/\/_middleware$/, "/x");
      return { file, path: path || "/" };
    });
}

/** The Cache-Control values a `_headers` file gives `pathname`. */
function cacheControl(headers, pathname) {
  const values = [];
  for (const block of headers.trim().split(/\n\s*\n/)) {
    const [rule, ...lines] = block.split("\n");
    const pattern = new RegExp(
      `^${rule
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/:\w+/g, "[^/]+")}$`,
    );
    if (!pattern.test(pathname)) continue;
    for (const line of lines) {
      const [name, ...value] = line.trim().split(":");
      if (name.toLowerCase() === "cache-control")
        values.push(value.join(":").trim());
    }
  }
  return values;
}
