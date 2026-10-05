import { describe, expect, it } from "vitest";
import { parseImageAssetId, sanityImageUrl } from "./sanity-image.js";

const ID = "image-0a1b2c3d4e5f-1600x1000-jpg";

describe("sanity image ids", () => {
  it("reads the size and type from the id", () => {
    expect(parseImageAssetId(ID)).toEqual({ sha1: "0a1b2c3d4e5f", width: 1600, height: 1000, ext: "jpg" });
    expect(parseImageAssetId("file-abc-pdf")).toBeNull();
    expect(parseImageAssetId("")).toBeNull();
  });

  it("builds the CDN address for the given project", () => {
    expect(sanityImageUrl("gwscpagy", ID)).toBe(
      "https://cdn.sanity.io/images/gwscpagy/production/0a1b2c3d4e5f-1600x1000.jpg",
    );
    expect(sanityImageUrl("pn5yjro6", ID, { w: 400, auto: "format", h: "" })).toBe(
      "https://cdn.sanity.io/images/pn5yjro6/production/0a1b2c3d4e5f-1600x1000.jpg?w=400&auto=format",
    );
    expect(sanityImageUrl("", ID)).toBe("");
    expect(sanityImageUrl("pn5yjro6", "nope")).toBe("");
  });
});
