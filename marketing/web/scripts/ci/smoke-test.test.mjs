import { describe, expect, it } from "vitest";
import {
  assertHomePageHealthy,
  collectSameOriginAssetPaths,
  deepCheckLine,
  parseFormsArg,
  pendingForms,
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
        '<title>Gwenda | Ristobar</title><a href="/join-list">Stay in touch</a>',
      ),
    ).not.toThrow();
  });
});

describe("the deep health report", () => {
  const checks = [
    { name: "form:play", ok: true, detail: "saved", ms: 900 },
    {
      name: "form:party",
      ok: true,
      pending: true,
      form: "party",
      detail: "not here yet",
      ms: 80,
    },
    { name: "signup", ok: false, error: "no database", ms: 5 },
  ];

  it("prints a form waiting for its migration as WAIT, not OK or FAIL", () => {
    expect(checks.map(deepCheckLine)).toEqual([
      "OK form:play: saved (900ms)",
      "WAIT form:party: not here yet (80ms)",
      "FAIL signup: no database (5ms)",
    ]);
  });

  it("lists the waiting forms for the run after the migrations", () => {
    expect(pendingForms(checks)).toEqual(["party"]);
    expect(pendingForms(checks.slice(0, 1))).toEqual([]);
    expect(pendingForms(undefined)).toEqual([]);
  });

  it("reads --forms as a list of web addresses", () => {
    expect(parseFormsArg("party, play")).toEqual(["party", "play"]);
    expect(parseFormsArg(undefined)).toEqual([]);
  });
});
