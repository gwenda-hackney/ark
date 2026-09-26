import { describe, expect, it } from "vitest";
import {
  findChannel,
  getEventRsvp,
  isValidChannelToken,
  saveRsvpResponse,
} from "./rsvp.js";

describe("isValidChannelToken", () => {
  it("accepts three-word event passwords", () => {
    expect(isValidChannelToken("candle-canal-vinyl")).toBe(true);
  });

  it("still accepts legacy alphanumeric access codes", () => {
    expect(isValidChannelToken("k7m2q9x4vp")).toBe(true);
    expect(isValidChannelToken("a".repeat(32))).toBe(true);
  });

  it("rejects invalid passwords", () => {
    expect(isValidChannelToken("abc")).toBe(false);
    expect(isValidChannelToken("has spaces!")).toBe(false);
    expect(isValidChannelToken("only-two")).toBe(false);
    expect(isValidChannelToken("")).toBe(false);
  });
});

describe("findChannel", () => {
  const event = {
    channels: [
      { label: "Dan - WhatsApp", token: "candle-canal-vinyl" },
      { label: "Instagram story", token: "ember-harbor-lantern" },
    ],
  };

  it("matches a password to its channel", () => {
    expect(findChannel(event, "Candle Canal Vinyl")?.label).toBe(
      "Dan - WhatsApp",
    );
  });

  it("returns null for an unknown or missing password", () => {
    expect(findChannel(event, "unknown-word-set-here")).toBeNull();
    expect(findChannel(event, "")).toBeNull();
    expect(findChannel({}, "candle-canal-vinyl")).toBeNull();
  });
});

describe("getEventRsvp", () => {
  it("blocks a missing slug", async () => {
    const result = await getEventRsvp({}, "", "candle-canal-vinyl");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe("saveRsvpResponse", () => {
  it("blocks a missing slug", async () => {
    const result = await saveRsvpResponse(
      {},
      { slug: "", token: "candle-canal-vinyl", attending: false },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});
