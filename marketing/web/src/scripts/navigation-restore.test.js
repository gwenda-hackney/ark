/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isRestoredNavigation,
  shouldPinScrollTop,
} from "./navigation-restore.js";
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

  it("detects soft restore from the navigation-restore class", () => {
    document.documentElement.classList.add("navigation-restore");
    expect(isRestoredNavigation()).toBe(true);
    document.documentElement.classList.remove("navigation-restore");
  });

  it("treats fresh navigation as normal (animations play)", () => {
    performance.getEntriesByType.mockReturnValue([{ type: "navigate" }]);
    expect(isRestoredNavigation()).toBe(false);
    expect(shouldSkipRevealAnimation()).toBe(false);
  });

  it("opens a new page at the top and keeps a restored offset", () => {
    expect(
      shouldPinScrollTop("push", "https://gwenda.test/artists/current"),
    ).toBe(true);
    expect(shouldPinScrollTop("replace", "/artists/current")).toBe(true);
    expect(shouldPinScrollTop("traverse", "/artists/current")).toBe(false);
    expect(shouldPinScrollTop("push", "/whats-on#series")).toBe(false);
  });
});
