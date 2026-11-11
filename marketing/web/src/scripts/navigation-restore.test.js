/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  initNavigationRestore,
  isRestoredNavigation,
  shouldPinScrollTop,
  whenScrollSettled,
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

describe("whenScrollSettled", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("performance", {
      getEntriesByType: vi.fn(() => [{ type: "navigate" }]),
    });
    // Reduced motion: the fonts class goes on at once, no font loading to fake.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    window.scrollTo = vi.fn();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs at once when nothing is pinning the page", () => {
    const fn = vi.fn();
    whenScrollSettled(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits for a new page's last pin to the top, so a scroll after it stays", () => {
    initNavigationRestore();
    const before = new Event("astro:before-preparation");
    Object.assign(before, {
      navigationType: "push",
      to: new URL("https://gwenda.test/contact/party"),
    });
    document.dispatchEvent(before);
    document.dispatchEvent(new Event("astro:after-swap"));

    const fn = vi.fn();
    whenScrollSettled(fn);
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    const pins = window.scrollTo.mock.calls.length;
    vi.advanceTimersByTime(100);
    expect(window.scrollTo.mock.calls.length).toBe(pins + 1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
