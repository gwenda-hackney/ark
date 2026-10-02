/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { currentPageAnchorId, pageAnchorSections } from "./page-anchors.js";

function place(el, top) {
  el.getBoundingClientRect = () => ({
    top,
    bottom: top + 40,
    left: 0,
    right: 200,
    width: 200,
    height: 40,
    x: 0,
    y: top,
    toJSON() {},
  });
}

describe("pageAnchorSections", () => {
  it("reads the headings currently in the document, not ones already replaced", () => {
    document.body.innerHTML = `
      <nav>
        <div class="site-nav-group site-nav-group--page">
          <a href="#series">Regular events</a>
          <a href="#special">Special events</a>
          <a href="/whats-on/schedule">Full schedule</a>
        </div>
      </nav>
      <ol>
        <li id="series">Regular events</li>
        <li id="special">Special events</li>
      </ol>
    `;
    const nav = document.querySelector("nav");
    const stale = document.getElementById("special");
    document.querySelector("ol").replaceChildren(
      Object.assign(document.createElement("li"), {
        id: "series",
        textContent: "Regular events",
      }),
      Object.assign(document.createElement("li"), {
        id: "special",
        textContent: "Special events",
      }),
    );

    const sections = pageAnchorSections(nav);
    expect(sections.map((section) => section.id)).toEqual([
      "series",
      "special",
    ]);
    expect(sections[1].el).not.toBe(stale);
    expect(stale.isConnected).toBe(false);
  });
});

describe("currentPageAnchorId", () => {
  it("underlines the group that has reached the bar", () => {
    document.body.innerHTML = `
      <li id="series">Regular events</li>
      <li id="special">Special events</li>
    `;
    const series = document.getElementById("series");
    const special = document.getElementById("special");
    const sections = [
      { id: "series", el: series },
      { id: "special", el: special },
    ];
    const line = 80;

    place(series, 400);
    place(special, 900);
    expect(currentPageAnchorId(sections, line)).toBe(null);

    place(series, -20);
    place(special, 700);
    expect(currentPageAnchorId(sections, line)).toBe("series");

    place(special, 40);
    expect(currentPageAnchorId(sections, line)).toBe("special");

    place(special, 200);
    expect(
      currentPageAnchorId(sections, line, { atEnd: true, viewportHeight: 900 }),
    ).toBe("special");
    expect(
      currentPageAnchorId(sections, line, {
        atEnd: false,
        viewportHeight: 900,
      }),
    ).toBe("series");
  });

  it("does not treat a removed heading as the current section", () => {
    document.body.innerHTML = `<li id="series">Regular events</li>`;
    const series = document.getElementById("series");
    const special = document.createElement("li");
    special.id = "special";
    place(series, -20);
    place(special, 0);
    expect(
      currentPageAnchorId(
        [
          { id: "series", el: series },
          { id: "special", el: special },
        ],
        80,
      ),
    ).toBe("series");
  });
});
