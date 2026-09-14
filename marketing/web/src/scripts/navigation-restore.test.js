/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isRestoredNavigation } from "./navigation-restore.js";
import { shouldSkipRevealAnimation } from "./reveal.js";

describe("navigation restore helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("performance", {
      getEntriesByType: vi.fn(() => [{ type: "navigate" }]),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects back-forward navigation", () => {
    performance.getEntriesByType.mockReturnValue([{ type: "back_forward" }]);
    expect(isRestoredNavigation()).toBe(true);
    expect(shouldSkipRevealAnimation()).toBe(true);
  });

  it("treats fresh navigation as normal (animations play)", () => {
    performance.getEntriesByType.mockReturnValue([{ type: "navigate" }]);
    expect(isRestoredNavigation()).toBe(false);
    expect(shouldSkipRevealAnimation()).toBe(false);
  });
});
