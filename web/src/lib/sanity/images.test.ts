import { describe, expect, it } from "vitest";
import {
  buildSanityImageUrl,
  galleryObjectPosition,
  mapSanityGalleryImage,
  mapSanityImage,
} from "./images";

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
  const sampleAssetId =
    "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-800x1000-png";

  it("maps a Sanity image field to menu image metadata", () => {
    const image = mapSanityImage(
      {
        alt: "Canal Bloom",
        asset: {
          _id: sampleAssetId,
          url: "https://cdn.sanity.io/images/pn5yjro6/development/abc-800x1000.png",
          metadata: { dimensions: { width: 800, height: 1000 } },
        },
      },
      "Fallback alt",
    );

    expect(image?.width).toBe(800);
    expect(image?.height).toBe(1000);
    expect(image?.alt).toBe("Canal Bloom");
    expect(image?.url).toContain("w=900");
    expect(image?.url).toContain("cdn.sanity.io");
  });

  it("applies crop and hotspot from Sanity image metadata", () => {
    const image = mapSanityImage({
      asset: { _id: sampleAssetId },
      crop: { top: 0.5, bottom: 0, left: 0, right: 0 },
      hotspot: { x: 0.5, y: 0.85, width: 1, height: 0.3 },
    });

    expect(image?.url).toMatch(/crop=|rect=/);
  });

  it("returns undefined when asset id is missing", () => {
    expect(mapSanityImage(null)).toBeUndefined();
    expect(mapSanityImage({ asset: { url: null } })).toBeUndefined();
  });
});

describe("mapSanityGalleryImage", () => {
  const sampleAssetId =
    "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-800x1000-png";

  it("delivers the Studio crop without a second tile crop pass", () => {
    const image = mapSanityGalleryImage({
      asset: {
        _id: sampleAssetId,
        metadata: { dimensions: { width: 800, height: 1000 } },
      },
      crop: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1 },
    });

    expect(image?.url).toContain("w=900");
    expect(image?.url).not.toContain("fit=crop");
    expect(image?.url).not.toMatch(/[?&]h=/);
    expect(image?.width).toBe(900);
    expect(image?.height).toBe(1125);
  });

  it("maps hotspot to object-position on the cropped image", () => {
    const position = galleryObjectPosition({
      asset: { metadata: { dimensions: { width: 1000, height: 1000 } } },
      crop: { top: 0, bottom: 0, left: 0.5, right: 0 },
      hotspot: { x: 0.75, y: 0.5, width: 0.2, height: 0.2 },
    });

    expect(position).toBe("50.0% 50.0%");
  });
});
