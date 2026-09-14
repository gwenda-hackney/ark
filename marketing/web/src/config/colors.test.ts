import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import colors from "./colors.json";

const cssPath = resolve(import.meta.dirname, "../styles/colors.css");

/** Map TS keys to CSS custom property names. */
const cssVarByKey: Record<keyof typeof colors, string> = {
  bg: "--color-bg",
  bgElevated: "--color-bg-elevated",
  bgStory: "--color-bg-story",
  bgStoryPrint: "--color-bg-story-print",
  bgCard: "--color-bg-card",
  bgScrim: "--color-bg-scrim",
  bgWarmLight: "--color-bg-warm-light",
  bgWarmMid: "--color-bg-warm-mid",
  bgDeep: "--color-bg-deep",
  bgCanalShadow: "--color-bg-canal-shadow",
  bgDampTimber: "--color-bg-damp-timber",
  bgVerdigris: "--color-bg-verdigris",
  text: "--color-text",
  textMuted: "--color-text-muted",
  gold: "--color-gold",
  goldDark: "--color-gold-dark",
  error: "--color-error",
};

function readCssValue(css: string, varName: string): string {
  const match = css.match(new RegExp(`${varName}:\\s*([^;]+);`));
  expect(match, `missing ${varName} in colors.css`).not.toBeNull();
  return match![1].trim();
}

describe("colors.css sync", () => {
  const css = readFileSync(cssPath, "utf8");

  for (const [key, varName] of Object.entries(cssVarByKey)) {
    it(`${varName} matches colors.${key}`, () => {
      expect(readCssValue(css, varName)).toBe(
        colors[key as keyof typeof colors],
      );
    });
  }
});
