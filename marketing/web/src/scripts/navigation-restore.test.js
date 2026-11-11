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

describe("a back/forward visit through the router", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("performance", {
      getEntriesByType: vi.fn(() => [{ type: "navigate" }]),
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.documentElement.className = "";
  });

  /** Back to a page: the router's events, the root's classes wiped at the swap. */
  function goBack() {
    const before = new Event("astro:before-preparation");
    Object.assign(before, {
      navigationType: "traverse",
      to: new URL("https://gwenda.test/#drinks"),
    });
    document.dispatchEvent(before);
    const incoming = document.implementation.createHTMLDocument("");
    const swap = new Event("astro:before-swap");
    Object.assign(swap, { newDocument: incoming });
    document.dispatchEvent(swap);
    document.documentElement.className = incoming.documentElement.className;
    document.dispatchEvent(new Event("astro:after-swap"));
  }

  it("scrolls at once while the offset lands, then lets jump links glide again", () => {
    initNavigationRestore();
    const root = document.documentElement;
    goBack();
    expect(root.classList.contains("is-restoring-scroll")).toBe(true);

    vi.advanceTimersByTime(100);
    expect(root.classList.contains("is-restoring-scroll")).toBe(false);
    // Still painted in its final state for the rest of the visit
    expect(isRestoredNavigation()).toBe(true);
  });

  it("counts the next page after a Back that loaded the page as a new visit", async () => {
    // A fresh module: the document's own load, which came by Back
    vi.resetModules();
    performance.getEntriesByType.mockReturnValue([{ type: "back_forward" }]);
    const restore = await import("./navigation-restore.js");
    restore.initNavigationRestore();
    expect(restore.isRestoredNavigation()).toBe(true);

    // On to another page through the router
    const before = new Event("astro:before-preparation");
    Object.assign(before, {
      navigationType: "push",
      to: new URL("https://gwenda.test/contact/party"),
    });
    document.dispatchEvent(before);
    document.documentElement.className = "";
    document.dispatchEvent(new Event("astro:after-swap"));

    expect(restore.isRestoredNavigation()).toBe(false);
  });

  it("keeps a second Back's landing instant when the first's ends", () => {
    initNavigationRestore();
    const root = document.documentElement;
    goBack();
    vi.advanceTimersByTime(16);
    goBack();
    // The first landing's second frame: the second is still landing
    vi.advanceTimersByTime(16);
    expect(root.classList.contains("is-restoring-scroll")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(root.classList.contains("is-restoring-scroll")).toBe(false);
  });
});
