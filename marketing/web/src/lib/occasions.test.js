import { describe, expect, it } from "vitest";
import {
  readOccasions,
  occasionEnquiryHref,
  occasionShowing,
  occasionsToCome,
} from "./occasions.js";

const christmas = {
  name: " Christmas parties ",
  line: "Book the back room.",
  included: ["Welcome drink", " ", "Canapés"],
  covers: "Throughout December",
  showFrom: "2026-11-01",
  showUntil: "2026-12-20",
  image: {
    url: "https://cdn.sanity.io/images/p/production/abc-1200x800.jpg",
    alt: "The room",
    width: 1200,
    height: 800,
  },
};

describe("occasions on the website", () => {
  it("reads what ops put there, blanks gone", () => {
    expect(readOccasions([christmas])).toEqual([
      {
        name: "Christmas parties",
        line: "Book the back room.",
        included: ["Welcome drink", "Canapés"],
        covers: "Throughout December",
        showFrom: "2026-11-01",
        showUntil: "2026-12-20",
        image: christmas.image,
      },
    ]);
  });

  it("leaves out one with no name or days that don't make sense", () => {
    expect(
      readOccasions([
        { ...christmas, name: "" },
        { ...christmas, showUntil: "2026-10-01" },
        null,
      ]),
    ).toEqual([]);
    expect(readOccasions(null)).toEqual([]);
  });

  it("shows from its first day to its last, both included", () => {
    const [occasion] = readOccasions([christmas]);
    expect(occasionShowing(occasion, "2026-10-31")).toBe(false);
    expect(occasionShowing(occasion, "2026-11-01")).toBe(true);
    expect(occasionShowing(occasion, "2026-12-20")).toBe(true);
    expect(occasionShowing(occasion, "2026-12-21")).toBe(false);
  });

  it("keeps the ones not over yet, soonest first", () => {
    const occasions = readOccasions([
      {
        ...christmas,
        name: "Summer",
        showFrom: "2027-05-01",
        showUntil: "2027-08-31",
      },
      {
        ...christmas,
        name: "Old",
        showFrom: "2025-11-01",
        showUntil: "2025-12-20",
      },
      christmas,
    ]);
    expect(
      occasionsToCome(occasions, "2026-11-19").map((item) => item.name),
    ).toEqual(["Christmas parties", "Summer"]);
  });

  it("opens the party form marked with the occasion", () => {
    expect(occasionEnquiryHref("Christmas parties")).toBe(
      "/contact/party?occasion=Christmas%20parties",
    );
  });
});
