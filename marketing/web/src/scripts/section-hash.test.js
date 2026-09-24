/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSectionUrl, initSectionHash } from "./section-hash.js";

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
});

describe("initSectionHash", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#story");

    document.body.innerHTML = `
      <main>
        <section id="hero"></section>
        <section id="story"></section>
        <section id="menu"></section>
      </main>
      <a href="#menu" id="menu-link">Menu</a>
      <a href="#story" id="story-link">Story</a>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("does nothing when the homepage hero is absent", () => {
    document.body.innerHTML = "<main><section id='story'></section></main>";
    const cleanup = initSectionHash();
    expect(cleanup).toBeTypeOf("function");
  });

  it("smooth-scrolls section anchors and updates the hash", () => {
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
    expect(replaceState).toHaveBeenCalledWith(history.state, "", "/#menu");
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

  it("keeps the view-transition history index when the hash changes", () => {
    const routerState = { index: 2, scrollX: 0, scrollY: 40 };
    window.history.replaceState(routerState, "", "/#story");
    const menu = document.getElementById("menu");
    if (menu) menu.scrollIntoView = vi.fn();
    const replaceState = vi.spyOn(window.history, "replaceState");
    initSectionHash();
    replaceState.mockClear();

    document.getElementById("menu-link")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(replaceState).toHaveBeenCalledWith(routerState, "", "/#menu");
    expect(history.state).toMatchObject({ index: 2 });
  });

  it("does not observe scroll or rewrite the hash on its own", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );

    initSectionHash();
    replaceState.mockClear();

    window.dispatchEvent(new Event("scroll"));
    expect(replaceState).not.toHaveBeenCalled();
  });
});
