import { describe, expect, it } from "vitest";
import { chartSections } from "./chart-nav.js";

describe("chartSections", () => {
  it("marks the current page", () => {
    const marked = chartSections("/bar/").filter((item) => item.current);
    expect(marked.map((item) => item.label)).toEqual(["Drinks"]);
  });

  it("marks nothing on home", () => {
    expect(chartSections("/").some((item) => item.current)).toBe(false);
  });

  it("lists what's on, the two menus and contact, and nothing else", () => {
    expect(chartSections("/whats-on").map((item) => item.label)).toEqual([
      "What's on",
      "Drinks",
      "Food",
      "Contact",
    ]);
  });

  it("numbers them in order", () => {
    expect(chartSections("/").map((item) => item.numeral)).toEqual([
      "I",
      "II",
      "III",
      "IV",
    ]);
  });
});
