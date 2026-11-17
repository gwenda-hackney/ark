import { describe, expect, it } from "vitest";
import {
  BOARDS,
  READABLE,
  cleanColour,
  contrast,
  kitchenColourStyle,
  readableOn,
} from "./kitchen-colour.js";

const CHEZ_PICKLE = "#0f4d32";

describe("a kitchen's colour as text on our boards", () => {
  it("lightens a dark green until it reads at 4.5:1 on every board", () => {
    const ink = readableOn(CHEZ_PICKLE);
    expect(ink).not.toBe(CHEZ_PICKLE);
    for (const board of BOARDS) {
      expect(contrast(ink, board)).toBeGreaterThanOrEqual(READABLE);
    }
  });

  it("lightens it just enough, and keeps it green", () => {
    const ink = readableOn(CHEZ_PICKLE);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    // Not washed out to near white: well short of 7:1 on the darkest board
    expect(contrast(ink, BOARDS[0])).toBeLessThan(7);
  });

  it("leaves a colour that already reads as it is", () => {
    expect(readableOn("#7fd1a4")).toBe("#7fd1a4");
  });

  it("is empty for no colour, or one that isn't", () => {
    expect(readableOn("")).toBe("");
    expect(readableOn("green")).toBe("");
    expect(cleanColour("#ABC")).toBe("#aabbcc");
  });
});

describe("a kitchen's colour on the page", () => {
  it("fills with the exact colour, cream text on it, and the readable tint for text", () => {
    expect(kitchenColourStyle(CHEZ_PICKLE)).toBe(
      `--kitchen-ink: ${readableOn(CHEZ_PICKLE)}; --kitchen-fill: #0f4d32; --kitchen-on-fill: #f2e8d2`,
    );
  });

  it("puts dark text on a colour too light for cream", () => {
    expect(kitchenColourStyle("#f5d76e")).toContain(
      "--kitchen-on-fill: #1a1510",
    );
  });

  it("sets nothing for a kitchen with no colour, so the CSS falls back to our red", () => {
    expect(kitchenColourStyle("")).toBe("");
    expect(kitchenColourStyle(undefined)).toBe("");
  });
});
