import { describe, expect, it } from "vitest";
import { assertValidSeason, season, seasonOrder, seasonProblems, seasonState } from "./season-model.js";

const christmas = {
  name: " Christmas parties ",
  line: "Book the back room for your work do.",
  included: "Welcome drink\n\n  Canapés \nYour own playlist",
  covers: "Throughout December",
  showFrom: "2026-11-01",
  showUntil: "2026-12-20",
  image: { asset: "image-abc-1200x800-jpg", alt: "The back room set for a party" },
};

describe("a season", () => {
  it("is trimmed, with what's included a line each and blank lines gone", () => {
    expect(season(christmas)).toEqual({
      name: "Christmas parties",
      line: "Book the back room for your work do.",
      included: "Welcome drink\nCanapés\nYour own playlist",
      covers: "Throughout December",
      showFrom: "2026-11-01",
      showUntil: "2026-12-20",
      image: { asset: "image-abc-1200x800-jpg", alt: "The back room set for a party" },
    });
  });

  it("has no picture until one is added", () => {
    expect(season({ ...christmas, image: { asset: " ", alt: "x" } }).image).toBeNull();
  });

  it("needs a name and both days, the last not before the first", () => {
    expect(seasonProblems({ ...christmas, name: "", showFrom: "2026-02-30", showUntil: "" })).toEqual({
      name: "Give it a name.",
      showFrom: "Pick the first day it shows.",
      showUntil: "Pick the last day it shows.",
    });
    expect(seasonProblems({ ...christmas, showUntil: "2026-10-31" })).toEqual({
      showUntil: "The last day comes after the first.",
    });
    expect(seasonProblems(christmas)).toEqual({});
  });

  it("refuses a bad one with each field's problem", () => {
    let caught;
    try {
      assertValidSeason({ ...christmas, line: "x".repeat(201) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ status: 400, problems: { line: "Keep it under 200 characters." } });
  });

  it("shows from its first day to its last, both included", () => {
    const value = season(christmas);
    expect(seasonState(value, "2026-10-31")).toBe("coming");
    expect(seasonState(value, "2026-11-01")).toBe("showing");
    expect(seasonState(value, "2026-12-20")).toBe("showing");
    expect(seasonState(value, "2026-12-21")).toBe("over");
  });

  it("lists showing and coming first, soonest first, then the ones that are over", () => {
    const list = [
      season({ name: "Summer terrace", showFrom: "2027-05-01", showUntil: "2027-08-31" }),
      season({ name: "Old Christmas", showFrom: "2025-11-01", showUntil: "2025-12-20" }),
      season(christmas),
    ];
    expect(seasonOrder(list, "2026-11-19").map((item) => item.name)).toEqual([
      "Christmas parties",
      "Summer terrace",
      "Old Christmas",
    ]);
  });
});
