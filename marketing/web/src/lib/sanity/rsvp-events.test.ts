import { describe, expect, it } from "vitest";
import { socialDescription } from "./rsvp-events";

describe("socialDescription", () => {
  it("returns short text unchanged", () => {
    expect(socialDescription("Launch party at Gwenda.")).toBe(
      "Launch party at Gwenda.",
    );
  });

  it("truncates long copy on a word boundary", () => {
    const long =
      "We're hosting a private launch party to celebrate the opening of Gwenda, and we'd love for you to come join us. Free signature cocktail from 5 to 7pm, music, and friends.";
    const result = socialDescription(long);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
  });
});
