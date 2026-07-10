import { describe, expect, it } from "vitest";
import { buildSanityImageUrl, mapSanityImage } from "./images";

describe("buildSanityImageUrl", () => {
  it("appends width and format params", () => {
    const url = buildSanityImageUrl(
      "https://cdn.sanity.io/images/pn5yjro6/development/abc-800x1000.jpg",
      { width: 900, quality: 80 },
    );
    expect(url).toContain("w=900");
    expect(url).toContain("auto=format");
    expect(url).toContain("q=80");
  });
});

describe("mapSanityImage", () => {
  it("maps a Sanity image field to menu image metadata", () => {
    const image = mapSanityImage(
      {
        alt: "Canal Bloom",
        asset: {
          url: "https://cdn.sanity.io/images/pn5yjro6/development/abc-800x1000.jpg",
          metadata: { dimensions: { width: 800, height: 1000 } },
        },
      },
      "Fallback alt",
    );

    expect(image?.width).toBe(800);
    expect(image?.height).toBe(1000);
    expect(image?.alt).toBe("Canal Bloom");
    expect(image?.url).toContain("w=900");
  });

  it("returns undefined when asset url is missing", () => {
    expect(mapSanityImage(null)).toBeUndefined();
    expect(mapSanityImage({ asset: { url: null } })).toBeUndefined();
  });
});
