import { describe, expect, it } from "vitest";
import {
  findChannel,
  getEventRsvp,
  isValidChannelToken,
  saveRsvpResponse,
} from "./rsvp.js";

describe("isValidChannelToken", () => {
  it("accepts short alphanumeric access codes", () => {
    expect(isValidChannelToken("k7m2q9x4vp")).toBe(true);
  });

  it("still accepts legacy 32-char hex tokens", () => {
    expect(isValidChannelToken("a".repeat(32))).toBe(true);
  });

  it("rejects invalid tokens", () => {
    expect(isValidChannelToken("abc")).toBe(false);
    expect(isValidChannelToken("has spaces!")).toBe(false);
    expect(isValidChannelToken("")).toBe(false);
  });
});

describe("findChannel", () => {
  const event = {
    channels: [
      { label: "Dan - WhatsApp", token: "a".repeat(32) },
      { label: "Instagram story", token: "b".repeat(32) },
    ],
  };

  it("matches a token to its channel", () => {
    expect(findChannel(event, "A".repeat(32))?.label).toBe("Dan - WhatsApp");
  });

  it("returns null for an unknown or missing token", () => {
    expect(findChannel(event, "c".repeat(32))).toBeNull();
    expect(findChannel(event, "")).toBeNull();
    expect(findChannel({}, "a".repeat(32))).toBeNull();
  });
});

describe("getEventRsvp", () => {
  it("blocks a missing slug", async () => {
    const result = await getEventRsvp({}, "", "a".repeat(32));
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe("saveRsvpResponse", () => {
  it("blocks a missing slug", async () => {
    const result = await saveRsvpResponse({}, { slug: "", token: "a".repeat(32), attending: false });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});
