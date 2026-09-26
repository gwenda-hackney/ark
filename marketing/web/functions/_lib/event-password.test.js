import { describe, expect, it } from "vitest";
import {
  EVENT_PASSWORD_PATTERN,
  buildEventInviteUrl,
  generateEventPassword,
  isValidEventPassword,
  normalizeEventPassword,
} from "./event-password.js";

describe("event-password", () => {
  it("generates three hyphen-separated words", () => {
    const password = generateEventPassword();
    expect(password.split("-")).toHaveLength(3);
    expect(EVENT_PASSWORD_PATTERN.test(password)).toBe(true);
  });

  it("normalizes spaces to hyphens", () => {
    expect(normalizeEventPassword("Candle Canal Vinyl")).toBe(
      "candle-canal-vinyl",
    );
  });

  it("accepts three-word passwords and legacy tokens", () => {
    expect(isValidEventPassword("candle-canal-vinyl")).toBe(true);
    expect(isValidEventPassword("a".repeat(32))).toBe(true);
    expect(isValidEventPassword("only-two")).toBe(false);
  });

  it("builds invite URLs with event-password query", () => {
    expect(
      buildEventInviteUrl(
        "https://gwenda.co.uk",
        "launch-party",
        "candle-canal-vinyl",
      ),
    ).toBe(
      "https://gwenda.co.uk/events/launch-party?event-password=candle-canal-vinyl",
    );
  });
});
