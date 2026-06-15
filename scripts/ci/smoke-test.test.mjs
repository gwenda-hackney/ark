import { describe, expect, it } from "vitest";
import {
  assertHomePageHealthy,
  collectSameOriginAssetPaths,
} from "./smoke-test-lib.mjs";

describe("collectSameOriginAssetPaths", () => {
  it("collects same-origin _astro assets", () => {
    const html = `
      <link rel="stylesheet" href="/_astro/index.abc.css">
      <script type="module" src="/_astro/hoisted.xyz.js"></script>
      <script src="https://static.cloudflareinsights.com/beacon.min.js"></script>
    `;
    expect(collectSameOriginAssetPaths(html, "https://gwenda.co.uk")).toEqual([
      "/_astro/index.abc.css",
      "/_astro/hoisted.xyz.js",
    ]);
  });
});

describe("assertHomePageHealthy", () => {
  it("accepts a normal homepage", () => {
    expect(() =>
      assertHomePageHealthy(
        "<title>Gwenda | Ristobar</title><div id=\"countdown\"></div>",
      ),
    ).not.toThrow();
  });
});
