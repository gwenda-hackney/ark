import { describe, expect, it } from "vitest";
import sharp from "sharp";
import colors from "../../src/config/colors.json";
import {
  computeStoryPrintFlatHex,
  renderStoryBackground,
  sampleStoryBackgroundHex,
} from "./story-background.mjs";

describe("story background swatch", () => {
  it("full-section sample matches colors.json bgStory", async () => {
    const buffer = await renderStoryBackground(colors);
    const sampled = await sampleStoryBackgroundHex(sharp(buffer));
    expect(sampled).toBe(colors.bgStory);
  });

  it("print flat hex matches colors.json bgStoryPrint", () => {
    expect(computeStoryPrintFlatHex(colors)).toBe(colors.bgStoryPrint);
  });
});
