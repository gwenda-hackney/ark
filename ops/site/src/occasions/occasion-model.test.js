import { describe, expect, it } from "vitest";
import { assertValidOccasion, occasion, occasionOrder, occasionProblems, occasionState } from "./occasion-model.js";

const christmas = {
  name: " Christmas parties ",
  line: "Book the back room for your work do.",
  included: "Welcome drink\n\n  Canapés \nYour own playlist",
  covers: "Throughout December",
  showFrom: "2026-11-01",
  showUntil: "2026-12-20",
  image: { asset: "image-abc-1200x800-jpg", alt: "The back room set for a party" },
};

describe("an occasion", () => {
  it("is trimmed, with what's included a line each and blank lines gone", () => {
    expect(occasion(christmas)).toEqual({
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
    expect(occasion({ ...christmas, image: { asset: " ", alt: "x" } }).image).toBeNull();
  });

  it("needs a name and both days, the last not before the first", () => {
    expect(occasionProblems({ ...christmas, name: "", showFrom: "2026-02-30", showUntil: "" })).toEqual({
      name: "Give it a name.",
      showFrom: "Pick the first day it shows.",
      showUntil: "Pick the last day it shows.",
    });
    expect(occasionProblems({ ...christmas, showUntil: "2026-10-31" })).toEqual({
      showUntil: "The last day comes after the first.",
    });
    expect(occasionProblems(christmas)).toEqual({});
  });

  it("refuses a bad one with each field's problem", () => {
    let caught;
    try {
      assertValidOccasion({ ...christmas, line: "x".repeat(201) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ status: 400, problems: { line: "Keep it under 200 characters." } });
  });

  it("shows from its first day to its last, both included", () => {
    const value = occasion(christmas);
    expect(occasionState(value, "2026-10-31")).toBe("coming");
    expect(occasionState(value, "2026-11-01")).toBe("showing");
    expect(occasionState(value, "2026-12-20")).toBe("showing");
    expect(occasionState(value, "2026-12-21")).toBe("over");
  });

  it("lists showing and coming first, soonest first, then the ones that are over", () => {
    const list = [
      occasion({ name: "Summer terrace", showFrom: "2027-05-01", showUntil: "2027-08-31" }),
      occasion({ name: "Old Christmas", showFrom: "2025-11-01", showUntil: "2025-12-20" }),
      occasion(christmas),
    ];
    expect(occasionOrder(list, "2026-11-19").map((item) => item.name)).toEqual([
      "Christmas parties",
      "Summer terrace",
      "Old Christmas",
    ]);
  });
});
