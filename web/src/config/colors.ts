/**
 * Canonical Gwenda color palette.
 *
 * Source: src/config/colors.json
 * CSS variables: src/styles/colors.css (must match — see colors.test.ts)
 * Designer reference: docs/colors.md
 */
import palette from "./colors.json";

export const colors = palette;

export type ColorName = keyof typeof colors;

/** Flat swatches for Canva, print, and other tools that need solid hex values. */
export const solidSwatches = {
  background: colors.bg,
  backgroundElevated: colors.bgElevated,
  backgroundStory: colors.bgStory,
  backgroundStoryPrint: colors.bgStoryPrint,
  backgroundCard: colors.bgCard,
  text: colors.text,
  textMuted: colors.textMuted,
  gold: colors.gold,
  error: colors.error,
} as const;

/** Parse #rrggbb to an RGB tuple (for sharp, canvas, etc.). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export const brandBackgroundRgb = hexToRgb(colors.bg);
