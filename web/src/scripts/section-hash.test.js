/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSectionUrl,
  initSectionHash,
  pickActiveSection,
} from "./section-hash.js";

describe("section-hash helpers", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("clears the hash for the hero section", () => {
    expect(buildSectionUrl("hero")).toBe("/");
    expect(buildSectionUrl(null)).toBe("/");
    expect(buildSectionUrl(undefined)).toBe("/");
  });

  it("builds section hashes for in-page anchors", () => {
    expect(buildSectionUrl("story")).toBe("/#story");
    expect(buildSectionUrl("menu")).toBe("/#menu");
  });

  it("picks the section with the highest intersection ratio", () => {
    const ratios = new Map([
      ["hero", 0.2],
      ["story", 0.65],
      ["menu", 0.1],
    ]);

    expect(pickActiveSection(ratios)).toBe("story");
    expect(pickActiveSection(new Map([["hero", 0]]))).toBeNull();
  });
});

describe("initSectionHash", () => {
  /** @type {IntersectionObserverCallback | null} */
  let observerCallback = null;

  class MockIntersectionObserver {
    /** @param {IntersectionObserverCallback} callback */
    constructor(callback) {
      observerCallback = callback;
    }

    observe() {}

    disconnect() {}
  }

  beforeEach(() => {
    observerCallback = null;
    window.history.replaceState(null, "", "/#story");
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    document.body.innerHTML = `
      <main>
        <section id="hero"></section>
        <section id="story"></section>
        <section id="menu"></section>
      </main>
      <a href="#menu" id="menu-link">Menu</a>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when the homepage hero is absent", () => {
    document.body.innerHTML = "<main><section id='story'></section></main>";
    expect(initSectionHash()).toBeTypeOf("function");
    expect(observerCallback).toBeNull();
  });

  it("replaces the hash while scrolling between sections", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");

    initSectionHash();
    replaceState.mockClear();

    observerCallback?.(
      [
        {
          target: document.getElementById("hero"),
          isIntersecting: true,
          intersectionRatio: 0.8,
        },
        {
          target: document.getElementById("story"),
          isIntersecting: true,
          intersectionRatio: 0.1,
        },
      ],
      /** @type {IntersectionObserver} */ ({}),
    );

    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });

  it("pauses hash updates briefly after anchor clicks", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const menu = document.getElementById("menu");
    const scrollIntoView = vi.fn();
    if (menu) menu.scrollIntoView = scrollIntoView;

    initSectionHash();
    replaceState.mockClear();

    document.getElementById("menu-link")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", block: "start" }),
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/#menu");
    replaceState.mockClear();

    observerCallback?.(
      [
        {
          target: document.getElementById("hero"),
          isIntersecting: true,
          intersectionRatio: 0.9,
        },
        {
          target: document.getElementById("menu"),
          isIntersecting: true,
          intersectionRatio: 0.05,
        },
      ],
      /** @type {IntersectionObserver} */ ({}),
    );

    expect(replaceState).not.toHaveBeenCalled();
  });

  it("smooth-scrolls even when the hash already matches", () => {
    window.history.replaceState(null, "", "/#menu");
    const menu = document.getElementById("menu");
    const scrollIntoView = vi.fn();
    if (menu) menu.scrollIntoView = scrollIntoView;

    initSectionHash();

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.getElementById("menu-link")?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });
});
