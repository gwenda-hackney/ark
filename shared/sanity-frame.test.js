import { describe, expect, it } from "vitest";
import {
  aspectFrame,
  parseRect,
  PORTRAIT_ASPECT,
  sourceSizeFromUrl,
} from "./sanity-frame.js";

describe("sourceSizeFromUrl", () => {
  it("reads the size from a Sanity CDN filename", () => {
    expect(
      sourceSizeFromUrl(
        "https://cdn.sanity.io/images/p/production/abc123-1600x2000.jpg?w=800",
      ),
    ).toEqual({ width: 1600, height: 2000 });
    expect(sourceSizeFromUrl("/images/p/production/abc-3000x2000.png")).toEqual(
      {
        width: 3000,
        height: 2000,
      },
    );
    expect(sourceSizeFromUrl("https://cdn.example/negroni.jpg")).toBeNull();
    expect(sourceSizeFromUrl("")).toBeNull();
  });
});

describe("parseRect", () => {
  it("reads x,y,w,h", () => {
    expect(parseRect("10,20,300,400")).toEqual({
      x: 10,
      y: 20,
      w: 300,
      h: 400,
    });
    expect(parseRect("10,20,0,400")).toBeNull();
    expect(parseRect("10,20,300")).toBeNull();
    expect(parseRect(null)).toBeNull();
  });
});

describe("aspectFrame", () => {
  it("takes the 4:5 slice through the middle of a 16×10 crop, at its height", () => {
    // A 1600×1000 crop at (200,100) in a 2000×1500 photo.
    expect(
      aspectFrame({ width: 2000, height: 1500 }, PORTRAIT_ASPECT, {
        around: { x: 200, y: 100, w: 1600, h: 1000 },
      }),
    ).toEqual({ x: 600, y: 100, w: 800, h: 1000 });
  });

  it("slides the frame back inside the photo", () => {
    // Crop centred near the left edge: the frame stops at x=0.
    expect(
      aspectFrame({ width: 2000, height: 1000 }, PORTRAIT_ASPECT, {
        around: { x: 0, y: 0, w: 400, h: 1000 },
      }),
    ).toEqual({ x: 0, y: 0, w: 800, h: 1000 });
  });

  it("narrows to the photo when the height would make it too wide", () => {
    // A tall narrow photo: the full height would need 1600 wide.
    expect(aspectFrame({ width: 1000, height: 2000 }, PORTRAIT_ASPECT)).toEqual(
      {
        x: 0,
        y: 375,
        w: 1000,
        h: 1250,
      },
    );
  });

  it("takes the largest frame of the whole photo, centred on the focus", () => {
    // Instagram from a landscape photo: 1080×1350 from 3000×2000.
    expect(
      aspectFrame({ width: 3000, height: 2000 }, PORTRAIT_ASPECT, {
        focus: { x: 0.9, y: 0.5 },
      }),
    ).toEqual({ x: 1400, y: 0, w: 1600, h: 2000 });
    expect(aspectFrame({ width: 3000, height: 2000 }, PORTRAIT_ASPECT)).toEqual(
      {
        x: 700,
        y: 0,
        w: 1600,
        h: 2000,
      },
    );
  });

  it("is null without a source size", () => {
    expect(aspectFrame(null, PORTRAIT_ASPECT)).toBeNull();
    expect(aspectFrame({ width: 0, height: 10 }, PORTRAIT_ASPECT)).toBeNull();
  });
});
