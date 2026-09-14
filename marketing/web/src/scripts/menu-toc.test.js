/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMenuSectionUrl, initMenuToc } from "./menu-toc.js";

describe("buildMenuSectionUrl", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/menu");
  });

  it("returns the path when section id is missing", () => {
    expect(buildMenuSectionUrl(null)).toBe("/menu");
    expect(buildMenuSectionUrl(undefined)).toBe("/menu");
    expect(buildMenuSectionUrl("")).toBe("/menu");
  });

  it("builds chapter hashes", () => {
    expect(buildMenuSectionUrl("our-formulas")).toBe("/menu#our-formulas");
  });
});

describe("initMenuToc", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/menu");
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = `
      <nav data-menu-toc>
        <ul>
          <li><a class="menu-toc-link" href="#our-formulas">Our Formulas</a></li>
          <li><a class="menu-toc-link" href="#the-cabinet">The Cabinet</a></li>
        </ul>
      </nav>
      <section id="our-formulas"></section>
      <section id="the-cabinet"></section>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("no-ops when the TOC is absent", () => {
    document.body.innerHTML = "<main></main>";
    const cleanup = initMenuToc();
    expect(cleanup).toBeTypeOf("function");
  });

  it("marks the first chapter active by default", () => {
    initMenuToc();
    const first = document.querySelector('a[href="#our-formulas"]');
    const second = document.querySelector('a[href="#the-cabinet"]');
    expect(first?.classList.contains("is-active")).toBe(true);
    expect(first?.getAttribute("aria-current")).toBe("true");
    expect(second?.classList.contains("is-active")).toBe(false);
  });

  it("smooth-scrolls and updates the hash on click", () => {
    const target = document.getElementById("the-cabinet");
    const scrollIntoView = vi.fn();
    if (target) target.scrollIntoView = scrollIntoView;

    initMenuToc();
    document.querySelector('a[href="#the-cabinet"]')?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    expect(scrollIntoView).toHaveBeenCalled();
    expect(location.hash).toBe("#the-cabinet");
    expect(
      document.querySelector('a[href="#the-cabinet"]')?.classList.contains(
        "is-active",
      ),
    ).toBe(true);
  });
});
