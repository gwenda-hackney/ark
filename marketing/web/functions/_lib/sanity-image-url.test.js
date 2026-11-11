import { describe, expect, it } from "vitest";
import {
  isWholeFit,
  markWholeFit,
  objectPositionFromHotspot,
  IMAGE_WIDTHS,
  imageSrcset,
  resolveHeroUrl,
  sanityCroppedUrl,
  sizedImageUrl,
  tinyImageUrl,
  withImageParams,
} from "./sanity-image-url.js";

const params = (url) => Object.fromEntries(new URL(url).searchParams);

describe("sizedImageUrl", () => {
  const cdn = "https://cdn.sanity.io/images/p/d";

  it("asks for the width wanted, whatever the address asked for before (#240)", () => {
    // As the site's data has it: 1600px wide, to show whole.
    const sized = new URL(
      sizedImageUrl(
        `${cdn}/abc-1132x1600.jpg?w=1600&q=86&auto=format#whole`,
        640,
      ),
    );
    expect(sized.searchParams.getAll("w")).toEqual(["640"]);
    expect(sized.searchParams.getAll("q")).toEqual(["86"]);
    expect(sized.searchParams.getAll("auto")).toEqual(["format"]);
    expect(sized.hash).toBe("#whole");
    // Twice over changes nothing more.
    expect(sizedImageUrl(sized.href, 640)).toBe(sized.href);
  });

  it("sizes a bare address", () => {
    expect(sizedImageUrl(`${cdn}/abc-1132x1600.jpg`, 320)).toBe(
      `${cdn}/abc-1132x1600.jpg?w=320&q=86&auto=format`,
    );
  });

  it("keeps a crop from ops and its shape: the height scales with the width", () => {
    // The site's builder frames a hero as a 16×10 card inside the crop.
    const framed = `${cdn}/abc-1584x2048.jpg?rect=0,529,1584,990&w=1600&h=1000&q=86&fit=crop&auto=format`;
    expect(params(sizedImageUrl(framed, 640))).toEqual({
      rect: "0,529,1584,990",
      w: "640",
      h: "400",
      q: "86",
      fit: "crop",
      auto: "format",
    });
    // The Pages Function's (fit=max) the same.
    const card = sanityCroppedUrl(
      `${cdn}/hero-1000x1000.jpg`,
      { left: 0, top: 0.2, right: 0, bottom: 0.1 },
      { width: 1000, height: 1000 },
    );
    expect(params(sizedImageUrl(card, 320))).toMatchObject({
      rect: "0,238,1000,625",
      w: "320",
      h: "200",
      fit: "max",
    });
  });

  it("keeps the focal point", () => {
    expect(
      params(
        sizedImageUrl(
          `${cdn}/abc-1600x1200.jpg?w=1600&fp-x=0.25&fp-y=0.5`,
          480,
        ),
      ),
    ).toMatchObject({ w: "480", "fp-x": "0.25", "fp-y": "0.5" });
  });

  it("drops a height that only sized it", () => {
    const sized = params(sizedImageUrl(`${cdn}/abc-1132x1600.jpg?h=900`, 320));
    expect(sized.w).toBe("320");
    expect(sized.h).toBeUndefined();
  });

  it("never asks for more than the picture has: the CDN would stretch it", () => {
    expect(
      params(sizedImageUrl(`${cdn}/abc-1132x1600.jpg?w=1600`, 1280)).w,
    ).toBe("1132");
    // A crop is all there is of a cropped one...
    expect(
      params(sizedImageUrl(`${cdn}/abc-2000x2000.jpg?rect=0,0,800,500`, 1280))
        .w,
    ).toBe("800");
    // ...and a 16×10 frame takes less still of a tall one.
    expect(
      params(
        sizedImageUrl(
          `${cdn}/abc-1000x2000.jpg?rect=0,0,1000,500&w=1600&h=1000&fit=crop`,
          1280,
        ),
      ),
    ).toMatchObject({ w: "800", h: "500" });
  });

  it("leaves anything that isn't on the image CDN as it is", () => {
    expect(sizedImageUrl("/images/flyer.jpg", 640)).toBe("/images/flyer.jpg");
    expect(sizedImageUrl("https://example.com/a.jpg?w=1600", 640)).toBe(
      "https://example.com/a.jpg?w=1600",
    );
    expect(sizedImageUrl("", 640)).toBe("");
    expect(sizedImageUrl(null, 640)).toBe("");
  });
});

describe("imageSrcset", () => {
  const cdn = "https://cdn.sanity.io/images/p/d";
  const offered = (url) =>
    imageSrcset(url)
      .split(", ")
      .map((candidate) => {
        const [address, width] = candidate.split(" ");
        return { asks: Number(new URL(address).searchParams.get("w")), width };
      });

  it("offers each width on the ladder, each address asking for its own (#240)", () => {
    const sizes = offered(
      `${cdn}/abc-1920x1920.jpg?w=1600&q=86&auto=format#whole`,
    );
    expect(sizes.map((size) => size.asks)).toEqual(IMAGE_WIDTHS);
    expect(sizes.map((size) => size.width)).toEqual(
      IMAGE_WIDTHS.map((width) => `${width}w`),
    );
    expect(imageSrcset(`${cdn}/abc-1920x1920.jpg#whole`)).not.toContain("#");
  });

  it("stops at the picture's own width", () => {
    expect(
      offered(`${cdn}/abc-1132x1600.jpg?w=1600`).map((size) => size.asks),
    ).toEqual([160, 320, 480, 640, 960, 1132]);
    // No step just under it: 960 and 1000 would be the same download twice.
    expect(
      offered(`${cdn}/abc-1000x1000.jpg`).map((size) => size.asks),
    ).toEqual([160, 320, 480, 640, 1000]);
    expect(offered(`${cdn}/abc-630x630.png`).map((size) => size.asks)).toEqual([
      160, 320, 480, 630,
    ]);
  });

  it("has nothing to offer for an image that isn't on the image CDN", () => {
    expect(imageSrcset("/images/flyer.jpg")).toBe("");
    expect(imageSrcset("")).toBe("");
  });
});

describe("tinyImageUrl", () => {
  it("asks Sanity for a tiny blurred copy, keeping the crop", () => {
    const tiny = new URL(
      tinyImageUrl(
        "https://cdn.sanity.io/images/p/d/a.jpg?rect=0,0,800,500&w=1800&auto=format&q=86",
      ),
    );
    expect(tiny.searchParams.get("rect")).toBe("0,0,800,500");
    expect(tiny.searchParams.get("w")).toBe("48");
    expect(tiny.searchParams.get("blur")).toBe("30");
  });

  it("keeps a framed card's shape", () => {
    expect(
      params(
        tinyImageUrl(
          "https://cdn.sanity.io/images/p/d/a-1584x2048.jpg?rect=0,529,1584,990&w=1600&h=1000&fit=crop",
        ),
      ),
    ).toMatchObject({ w: "48", h: "30" });
  });

  it("leaves other images alone", () => {
    expect(tinyImageUrl("/images/flyer.jpg")).toBe("");
    expect(tinyImageUrl("https://example.com/a.jpg")).toBe("");
  });
});

describe("sanityCroppedUrl", () => {
  it("delivers the 16×10 card inside the crop, without cropping it again", () => {
    const url = sanityCroppedUrl(
      "https://cdn.sanity.io/images/demo/production/hero.jpg",
      { left: 0, top: 0.2, right: 0, bottom: 0.1 },
      { width: 1000, height: 1000 },
      { width: 800, height: 500, quality: 80 },
    );
    // Stored window is 1000×700. The card inside it is 1000×625.
    expect(url).toContain("rect=0%2C238%2C1000%2C625");
    expect(url).toContain("w=800");
    expect(url).toContain("h=500");
    expect(url).toContain("fit=max");
    expect(url).not.toContain("fit=crop");
    expect(url).toContain("auto=format");
  });

  it("still requests a 16×10 crop when there is no edge crop", () => {
    const url = sanityCroppedUrl(
      "https://cdn.sanity.io/images/demo/production/hero.jpg",
      { left: 0, top: 0, right: 0, bottom: 0 },
      { width: 1000, height: 1000 },
    );
    expect(url).not.toContain("rect=");
    expect(url).not.toContain("fit=crop");
    expect(url).toContain("w=1600");
  });
});

describe("objectPositionFromHotspot", () => {
  it("maps hotspot fractions to CSS object-position", () => {
    expect(
      objectPositionFromHotspot({ x: 0.5, y: 0.8, width: 0.2, height: 0.2 }),
    ).toBe("50.0% 80.0%");
  });
});

describe("whole image heroes (#27)", () => {
  it("marks the URL only for fit: whole, once", () => {
    const url = "https://cdn.sanity.io/images/p/d/a.jpg";
    expect(markWholeFit(url, "whole")).toBe(`${url}#whole`);
    expect(markWholeFit(`${url}#whole`, "whole")).toBe(`${url}#whole`);
    expect(markWholeFit(url, "fill")).toBe(url);
    expect(isWholeFit(`${url}#whole`)).toBe(true);
    expect(isWholeFit(url)).toBe(false);
  });

  it("adds query parameters before the fragment", () => {
    expect(withImageParams("https://x.co/a.jpg#whole", "w=960")).toBe(
      "https://x.co/a.jpg?w=960#whole",
    );
    expect(withImageParams("https://x.co/a.jpg?q=1", "w=960")).toBe(
      "https://x.co/a.jpg?q=1&w=960",
    );
  });

  it("resolves an uncropped, marked hero from a list row", () => {
    const url = resolveHeroUrl({
      heroAssetUrl: "https://cdn.sanity.io/images/p/d/a.jpg",
      heroFit: "whole",
      heroCrop: null,
      heroHotspot: null,
    });
    expect(url).not.toMatch(/rect=/);
    expect(isWholeFit(url)).toBe(true);
  });
});
