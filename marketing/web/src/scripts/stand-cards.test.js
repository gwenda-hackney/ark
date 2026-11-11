/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { initStandCards } from "./stand-cards.js";

/**
 * Home's row as built on Wed 11 Nov: Cocktail Hour (Wed to Sat, running to
 * December), Chez Pickle (one night, Thu 12), and Taco Friday (Fri 13 and
 * Fri 20, "from 13 Nov" until it starts).
 */
function row() {
  const card = (title, when, timeline, last) =>
    `<li class="ch-stand" data-stand-when='${JSON.stringify(timeline)}' data-stand-last="${last}"><h4>${title}</h4><p class="ch-night-time" data-stand-when-line>${when}</p></li>`;
  document.body.innerHTML = `<div class="ch-stand-row">
    <section class="ch-stand-section" id="deals"><ul class="ch-stands">${card(
      "Cocktail Hour",
      "Wed to Sat, 5–6:30pm",
      [["2026-11-11", "Wed to Sat, 5–6:30pm"]],
      "2026-12-19",
    )}</ul></section>
    <section class="ch-stand-section" id="pop-up-kitchen"><ul class="ch-stands">${card(
      "Chez Pickle",
      "Thu 12 Nov, 5–10pm",
      [["2026-11-12", "Thu 12 Nov, 5–10pm"]],
      "2026-11-12",
    )}${card(
      "Taco Friday",
      "Fridays, from 13 Nov, until 20 Nov, 6–10pm",
      [["2026-11-13", "Fridays, until 20 Nov, 6–10pm"]],
      "2026-11-20",
    )}</ul></section>
  </div>`;
}

const on = (iso) => {
  row();
  initStandCards(new Date(`${iso}T12:00:00Z`));
  return [...document.querySelectorAll(".ch-stand")]
    .filter((card) => !card.hidden)
    .map(
      (card) =>
        `${card.querySelector("h4").textContent}: ${card.querySelector("[data-stand-when-line]").textContent}`,
    );
};
const sectionShown = (id) => !document.getElementById(id).hidden;

describe("initStandCards", () => {
  it("leaves the cards as built on the day they were built", () => {
    expect(on("2026-11-11")).toEqual([
      "Cocktail Hour: Wed to Sat, 5–6:30pm",
      "Chez Pickle: Thu 12 Nov, 5–10pm",
      "Taco Friday: Fridays, from 13 Nov, until 20 Nov, 6–10pm",
    ]);
  });

  it("past a pop-up's one night, drops it; a deal keeps its pattern", () => {
    expect(on("2026-11-15")).toEqual([
      "Cocktail Hour: Wed to Sat, 5–6:30pm",
      "Taco Friday: Fridays, until 20 Nov, 6–10pm",
    ]);
    expect(sectionShown("pop-up-kitchen")).toBe(true);
  });

  it("drops a kind's section once none of its cards is left", () => {
    expect(on("2026-11-21")).toEqual(["Cocktail Hour: Wed to Sat, 5–6:30pm"]);
    expect(sectionShown("pop-up-kitchen")).toBe(false);
    expect(sectionShown("deals")).toBe(true);
  });

  it("drops the whole row once nothing in it is on", () => {
    on("2026-12-20");
    expect(document.querySelector(".ch-stand-row").hidden).toBe(true);
  });
});
