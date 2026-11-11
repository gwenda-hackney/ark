import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAWINGS, drawingSvg } from "./chart-drawings.js";

describe("the line drawings", () => {
  it.each(Object.keys(DRAWINGS))(
    "draws the %s in the colour of the place it sits in",
    (name) => {
      const { body } = DRAWINGS[name];
      expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
      expect(body).not.toMatch(/<svg\b/);
    },
  );
});

describe("drawingSvg", () => {
  it("draws one inline, a line in currentColor, decorative", () => {
    const svg = drawingSvg("compass", { className: "ch-rose" });
    expect(svg).toMatch(/^<svg\b[^>]*>[\s\S]*<\/svg>$/);
    expect(svg).toContain(`viewBox="${DRAWINGS.compass.viewBox}"`);
    expect(svg).toContain('class="ch-rose"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain(`stroke-width="${DRAWINGS.compass.strokeWidth}"`);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain(DRAWINGS.compass.body);
  });

  it("refuses a drawing it doesn't have", () => {
    expect(() => drawingSvg("anchor")).toThrow(/anchor/);
    expect(() => drawingSvg("toString")).toThrow();
  });
});

/** Every file under src/ but this module and its test. */
function sources(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path, root);
    if (/^chart-drawings\.(test\.)?js$/.test(entry.name)) return [];
    return /\.(astro|js|ts|css)$/.test(entry.name)
      ? [{ file: path.slice(root.length), text: readFileSync(path, "utf8") }]
      : [];
  });
}

describe("the compass rose (#240)", () => {
  // Its needle, the one stroke no other drawing has
  const needle = "M12 5.6l1.8 5.2L12 18.4l-1.8-7.6z";

  it("is drawn once, here, for the menu panel", () => {
    expect(DRAWINGS.compass.body).toContain(needle);
    const copies = sources(new URL("..", import.meta.url).pathname)
      .filter(({ text }) => text.includes(needle))
      .map(({ file }) => file);
    expect(copies).toEqual([]);
  });
});
