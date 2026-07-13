import { describe, expect, it } from "vitest";
import { isValidInviteToken, saveRsvpGuests } from "./rsvp.js";

describe("isValidInviteToken", () => {
  it("accepts 32-char hex tokens", () => {
    expect(isValidInviteToken("a".repeat(32))).toBe(true);
  });

  it("rejects invalid tokens", () => {
    expect(isValidInviteToken("short")).toBe(false);
    expect(isValidInviteToken("")).toBe(false);
  });
});

describe("saveRsvpGuests", () => {
  it("validates guest count", async () => {
    const result = await saveRsvpGuests({}, "a".repeat(32), 99);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });
});
