import { describe, expect, it } from "vitest";
import { buildInviteUrl } from "./invite-url.js";

describe("buildInviteUrl", () => {
  it("builds opaque event RSVP links", () => {
    const code = "a".repeat(32);
    const token = "b".repeat(32);
    expect(buildInviteUrl("https://gwenda.co.uk", code, token)).toBe(
      `https://gwenda.co.uk/events/${code}/${token}`,
    );
  });

  it("falls back to legacy invite links without an event code", () => {
    expect(buildInviteUrl("https://gwenda.co.uk/", "", "b".repeat(32))).toBe(
      `https://gwenda.co.uk/invite/${"b".repeat(32)}`,
    );
  });
});
