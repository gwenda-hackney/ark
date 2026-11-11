import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RECORD_DRAWINGS } from "./chart-record-drawings.js";
import { recordSvg } from "./chart-record.js";

describe("recordSvg", () => {
  it("draws the record inline, decorative, sized by the page's CSS", () => {
    const svg = recordSvg();
    expect(svg).toMatch(/^<svg\b[^>]*>[\s\S]*<\/svg>$/);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).not.toMatch(/\srole=|aria-label/);
    // No size of its own: the place it sits in sizes it
    expect(svg).not.toMatch(/<svg\b[^>]*\s(width|height)=/);
    expect(svg).toContain(`viewBox="${RECORD_DRAWINGS.small.viewBox}"`);
    expect(svg).toContain(RECORD_DRAWINGS.small.body);
  });

  it("has no board behind it, at either size", () => {
    for (const size of ["small", "large"])
      expect(recordSvg({ size })).not.toMatch(/<rect\b/);
  });

  it("draws the grooved record for a big frame", () => {
    const svg = recordSvg({ size: "large" });
    expect(svg).toContain(`viewBox="${RECORD_DRAWINGS.large.viewBox}"`);
    expect(svg).toContain(RECORD_DRAWINGS.large.body);
  });

  it("is a picture with a name when it is given a label", () => {
    const svg = recordSvg({ label: 'Back to "top"' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Back to &quot;top&quot;"');
    expect(svg).not.toContain("aria-hidden");
  });

  it("carries the place's own class beside its own", () => {
    expect(recordSvg({ className: "ch-night-mark" })).toMatch(
      /<svg\b[^>]*\sclass="ch-record ch-night-mark"/,
    );
  });

  it("refuses a size it has no drawing for", () => {
    expect(() => recordSvg({ size: "huge" })).toThrow();
  });
});

/** Every .astro file under src/. */
function astroFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(path);
    return entry.name.endsWith(".astro") ? [path] : [];
  });
}

describe("a night with no flyer (#240)", () => {
  const src = new URL("..", import.meta.url).pathname;
  const marks = astroFiles(src).flatMap((file) =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /<(\w+)\b[^>]*ch-night-mark[^>]*>/g,
      ),
    ].map(([tag, name]) => ({ file: file.slice(src.length), tag, name })),
  );

  // A night's own page draws its frame itself (event-page.js, tested there)
  it("is drawn in the night cards and the deals", () => {
    expect(marks.map((mark) => mark.file).sort()).toEqual([
      "components/chart/NightCards.astro",
      "components/chart/StandingCards.astro",
    ]);
  });

  it("shows the record in its empty frame, never the faded logo", () => {
    for (const mark of marks)
      expect(mark).toMatchObject({ name: "ChartRecord" });
  });
});
