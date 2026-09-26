import { describe, expect, it } from "vitest";
import { sanityPerspective } from "./env";

describe("sanityPerspective", () => {
  it("uses draft overlay in local astro dev", () => {
    expect(sanityPerspective({ dev: true })).toBe("previewDrafts");
  });

  it("uses published unless a dev server or the build says otherwise", () => {
    expect(sanityPerspective({ dev: false })).toBe("published");
  });

  it("lets SANITY_PERSPECTIVE override", () => {
    expect(sanityPerspective({ dev: true, perspective: "published" })).toBe(
      "published",
    );
    expect(sanityPerspective({ dev: false, perspective: "previewDrafts" })).toBe(
      "previewDrafts",
    );
  });
});
