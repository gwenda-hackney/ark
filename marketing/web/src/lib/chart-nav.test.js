import { describe, expect, it } from "vitest";
import { chartSections } from "./chart-nav.js";

describe("chartSections", () => {
  it("marks the current page once, on the first section that owns it", () => {
    const marked = chartSections("/menu/").filter((item) => item.current);
    expect(marked.map((item) => item.label)).toEqual(["Bar"]);
  });

  it("marks nothing on home", () => {
    expect(chartSections("/").some((item) => item.current)).toBe(false);
  });

  it("keeps the order and the numerals", () => {
    expect(chartSections("/whats-on").map((item) => item.numeral)).toEqual([
      "I",
      "II",
      "III",
      "IV",
      "V",
    ]);
  });
});
