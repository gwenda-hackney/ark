import { describe, expect, it } from "vitest";
import {
  assertHomePageHealthy,
  collectSameOriginAssetPaths,
  assertPicturesSized,
  deepCheckLine,
  oversizedPictures,
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
  const footSignup =
    '<footer><form class="signup-form" id="footer-signup-form" novalidate><input type="email" name="email"></form></footer>';

  it("accepts a normal homepage: the sign-up is the one in the foot", () => {
    expect(() =>
      assertHomePageHealthy(`<title>Gwenda | Social</title>${footSignup}`),
    ).not.toThrow();
  });

  it("refuses a homepage with no way onto the list", () => {
    expect(() =>
      assertHomePageHealthy(
        '<title>Gwenda | Social</title><a href="/join-list">Get on the list</a>',
      ),
    ).toThrow(/sign-up/);
  });

  it("refuses a page that isn't ours", () => {
    expect(() => assertHomePageHealthy(footSignup)).toThrow(/title/);
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

describe("oversizedPictures", () => {
  const flyer = "https://cdn.sanity.io/images/p/production/abc-1132x1600.jpg";

  it("catches a choice of sizes that is one 1600px file (#240)", () => {
    // What What's on served: Astro writes & as &#38;.
    const big = `${flyer}?w=1600&#38;q=86&#38;auto=format#whole`;
    const html = `<img src="${big}" srcset="${big} 640w, ${big} 1280w" sizes="100vw" alt="">`;
    expect(oversizedPictures(html)).toEqual([
      "abc-1132x1600.jpg?w=1600&q=86&auto=format#whole: offered as 640px wide, asks for 1600px",
      "abc-1132x1600.jpg?w=1600&q=86&auto=format#whole: offered as 1280px wide, asks for 1600px",
    ]);
    expect(() => assertPicturesSized(html, "/whats-on")).toThrow(
      /\/whats-on has 2 picture\(s\) bigger than shown/,
    );
  });

  it("catches a flyer with one big size for every screen, or the original", () => {
    expect(
      oversizedPictures(`<img src="${flyer}?w=1600&amp;auto=format" alt="">`),
    ).toEqual([
      "abc-1132x1600.jpg?w=1600&auto=format: one size for every screen, 1600px wide",
    ]);
    expect(oversizedPictures(`<img src="${flyer}" alt="">`)).toEqual([
      "abc-1132x1600.jpg: one size for every screen, the original file",
    ]);
  });

  it("passes sizes that each ask for their own width, crops and all", () => {
    const html = `
      <img src="${flyer}?w=640&amp;q=86&amp;auto=format"
        srcset="${flyer}?w=160&amp;q=86&amp;auto=format 160w, ${flyer}?w=320&amp;q=86&amp;auto=format 320w, ${flyer}?rect=0,10,1132,700&amp;w=1132&amp;h=700 1132w"
        sizes="5rem" alt="">
      <img src="${flyer}?w=960&amp;auto=format" alt="">
      <img src="/_astro/bottle.abc.webp" srcset="/_astro/bottle.abc.webp 1x, /_astro/bottle.def.webp 2x" alt="">`;
    expect(oversizedPictures(html)).toEqual([]);
    expect(() => assertPicturesSized(html, "/")).not.toThrow();
  });
});
