import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("booking config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("defaults to the go-live date when PUBLIC_BOOKING_ENABLED_FROM is unset", async () => {
    vi.stubEnv("PUBLIC_BOOKING_ENABLED_FROM", "");
    const {
      DEFAULT_BOOKING_ENABLED_FROM,
      bookingEnabledFrom,
      isBookingEnabled,
      isBookingScheduled,
    } = await import("./booking");
    expect(bookingEnabledFrom).toBe(DEFAULT_BOOKING_ENABLED_FROM);
    expect(isBookingScheduled()).toBe(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${DEFAULT_BOOKING_ENABLED_FROM}T00:00:00`));
    expect(isBookingEnabled()).toBe(true);
  });

  it("enables on and after the go-live date", async () => {
    vi.stubEnv("PUBLIC_BOOKING_ENABLED_FROM", "2026-07-18");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T23:59:59"));
    const { isBookingEnabled, isBookingScheduled } = await import("./booking");
    expect(isBookingScheduled()).toBe(true);
    expect(isBookingEnabled()).toBe(false);
    vi.setSystemTime(new Date("2026-07-18T00:00:00"));
    expect(isBookingEnabled()).toBe(true);
  });
});
