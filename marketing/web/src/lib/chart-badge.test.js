import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BADGE_KINDS, badgeSvg } from "./chart-badge.js";
import { DRAWINGS } from "./chart-drawings.js";
import { RECORD_DRAWINGS } from "./chart-record-drawings.js";

describe("badgeSvg", () => {
  it("comes in three kinds: the record, the compass and the bottle", () => {
    expect([...BADGE_KINDS].sort()).toEqual(["bottle", "compass", "record"]);
  });

  it.each(BADGE_KINDS)(
    "draws the %s inline, decorative, sized by its place",
    (kind) => {
      const svg = badgeSvg(kind);
      expect(svg).toMatch(/^<svg\b[^>]*>[\s\S]*<\/svg>$/);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      // The heading beside it carries the meaning, and it is no tab stop
      expect(svg).not.toMatch(/\srole=|aria-label|tabindex/);
      expect(svg).not.toMatch(/<svg\b[^>]*\s(width|height)=/);
      expect(svg).toMatch(
        new RegExp(
          `<svg\\b[^>]*\\sclass="[^"]*\\bch-badge ch-badge--${kind}\\b`,
        ),
      );
    },
  );

  it("draws the record as the record (chart-record.js), its own frame", () => {
    const svg = badgeSvg("record");
    expect(svg).toContain(`viewBox="${RECORD_DRAWINGS.small.viewBox}"`);
    expect(svg).toContain(RECORD_DRAWINGS.small.body);
  });

  it.each(["compass", "bottle"])(
    "draws the %s on the one round frame",
    (kind) => {
      const svg = badgeSvg(kind);
      expect(svg).toContain(DRAWINGS[kind].body);
      // The rim, a ring, the face, and the drawing on it, in that order
      const parts = ["ch-badge-rim", "ch-badge-ring", "ch-badge-face"].map(
        (part) => svg.indexOf(`class="${part}"`),
      );
      parts.push(svg.indexOf(DRAWINGS[kind].body));
      expect(parts.every((at) => at > 0)).toBe(true);
      expect([...parts].sort((a, b) => a - b)).toEqual(parts);
      expect(svg).toMatch(/<g\b[^>]*\sclass="ch-badge-ink"/);
    },
  );

  // A redrawn record takes one change in chart-badge.css, nothing here
  it.each(["compass", "bottle"])(
    "leaves the %s's colours to the page's CSS",
    (kind) => {
      expect(badgeSvg(kind)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    },
  );

  it("carries the place's own class beside its own", () => {
    expect(badgeSvg("compass", { className: "ch-x" })).toMatch(
      /<svg\b[^>]*\sclass="ch-badge ch-badge--compass ch-x"/,
    );
    expect(badgeSvg("record", { className: "ch-x" })).toMatch(
      /<svg\b[^>]*\sclass="[^"]*ch-badge ch-badge--record ch-x"/,
    );
  });

  it("refuses a kind it has no drawing for", () => {
    expect(() => badgeSvg("anchor")).toThrow(/anchor/);
    expect(() => badgeSvg(undefined)).toThrow();
    // Not something every object has
    expect(() => badgeSvg("toString")).toThrow();
  });
});

/** Every .astro file under src/, as { file, text }, file from src/. */
function astroFiles(dir, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(path, root);
    return entry.name.endsWith(".astro")
      ? [{ file: path.slice(root.length), text: readFileSync(path, "utf8") }]
      : [];
  });
}

describe("the badges on the site (#240)", () => {
  const files = astroFiles(new URL("..", import.meta.url).pathname);

  it("sit on home's row and over Contact's party and play, nowhere else", () => {
    const using = files
      .filter(({ text }) => /<ChartBadge\b/.test(text))
      .map(({ file }) => file)
      .sort();
    expect(using).toEqual([
      "components/chart/ChartHome.astro",
      "pages/contact.astro",
    ]);
  });

  it("leave the buttons and links plain words", () => {
    const marked = files.flatMap(({ file, text }) =>
      [
        ...text.matchAll(
          /<(a|span)\b[^>]*class="[^"]*\b(ch-btn|ch-home-more-link)\b[^"]*"[^>]*>([\s\S]*?)<\/\1\s*>/g,
        ),
      ]
        .filter(([, , , inner]) => /<Chart(Record|Badge)\b/.test(inner))
        .map(([whole]) => `${file}: ${whole}`),
    );
    expect(marked).toEqual([]);
  });
});
