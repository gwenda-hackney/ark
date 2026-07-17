/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isRestoredNavigation,
  whenNavigationReady,
} from "./navigation-restore.js";
import { shouldSkipRevealAnimation } from "./reveal.js";

describe("navigation restore helpers", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    vi.stubGlobal("performance", {
      getEntriesByType: vi.fn(() => [{ type: "navigate" }]),
    });
  });

  afterEach(() => {
    document.documentElement.className = "";
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

  it("marks restore settled so smooth scrolling can resume", () => {
    whenNavigationReady(() => {});
    expect(
      document.documentElement.classList.contains("navigation-restore-settled"),
    ).toBe(true);
  });
});
