// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { initSeasonCards } from "./season-cards.js";

function page() {
  document.body.innerHTML = `<section data-season-cards>
    <article data-season-from="2026-11-01" data-season-until="2026-12-20">Christmas</article>
    <article data-season-from="2027-05-01" data-season-until="2027-08-31">Summer</article>
  </section>`;
  return document.querySelector("[data-season-cards]");
}

describe("seasons on home, on the visitor's day (#353)", () => {
  it("shows the ones on today", () => {
    const section = page();
    initSeasonCards(new Date("2026-12-20T20:00:00Z"));
    const [christmas, summer] = section.querySelectorAll("article");
    expect([christmas.hidden, summer.hidden, section.hidden]).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("takes the section away when none is on", () => {
    const section = page();
    initSeasonCards(new Date("2026-12-21T09:00:00Z"));
    expect(section.hidden).toBe(true);
  });
});
