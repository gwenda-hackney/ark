/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { LEAD_NIGHT_SIZES } from "../lib/night-cards.js";
import { initNightCards } from "./night-cards.js";

const ROW_SIZES = "(min-width: 64.0625rem) 19.2rem, 5rem";

/** The list as built on Tuesday 10 Nov: that night leads. */
function page() {
  const night = (date, lead) =>
    `<li class="ch-night${lead ? " ch-night--lead" : ""}" data-night="${date}" data-night-end="${date}">
      <span class="ch-night-photo"><img src="https://cdn.sanity.io/images/p/d/a-800x1000.jpg?w=640" sizes="${lead ? LEAD_NIGHT_SIZES : ROW_SIZES}" data-row-sizes="${ROW_SIZES}" alt=""></span>
      <span data-night-label></span>
    </li>`;
  document.body.innerHTML = `<div data-night-cards><ol>${night("2026-11-10", true)}${night("2026-11-12", false)}${night("2026-11-13", false)}</ol></div>`;
  return [...document.querySelectorAll("[data-night]")];
}

const sizes = (night) => night.querySelector("img").getAttribute("sizes");

describe("initNightCards", () => {
  it("leaves the pictures as built while the same night leads", () => {
    const nights = page();
    initNightCards(new Date("2026-11-10T12:00:00Z"));
    expect(nights.map((night) => night.hidden)).toEqual([false, false, false]);
    expect(nights.map(sizes)).toEqual([LEAD_NIGHT_SIZES, ROW_SIZES, ROW_SIZES]);
  });

  it("asks for the next night's picture at the big size once it leads (#240)", () => {
    const nights = page();
    initNightCards(new Date("2026-11-11T12:00:00Z"));
    expect(nights.map((night) => night.hidden)).toEqual([true, false, false]);
    expect(nights[1].classList.contains("ch-night--lead")).toBe(true);
    // A thumbnail's worth of pixels would be a blur at the lead's size.
    expect(sizes(nights[1])).toBe(LEAD_NIGHT_SIZES);
    expect(sizes(nights[2])).toBe(ROW_SIZES);
  });
});

describe("initNightCards on home's This week (data-this-week)", () => {
  /**
   * Built on Wed 11 Nov: this week's nights, then next week's Tue 17 and the
   * EPIC Jam weekend (Sat 21 to Sun 22), spare for the days after the build.
   */
  function homePage() {
    const night = (date, end = date) =>
      `<li class="ch-night" data-night="${date}" data-night-end="${end}"><span data-night-label></span></li>`;
    document.body.innerHTML = `<div data-night-cards data-shown="5" data-this-week><ol>${night("2026-11-11")}${night("2026-11-13")}${night("2026-11-17")}${night("2026-11-21", "2026-11-22")}</ol><p data-night-cards-empty hidden>Nothing on this week.</p></div>`;
    return [...document.querySelectorAll("[data-night]")];
  }
  const empty = () => document.querySelector("[data-night-cards-empty]").hidden;
  const shownOn = (iso) => {
    const nights = homePage();
    initNightCards(new Date(`${iso}T12:00:00Z`));
    return nights.filter((n) => !n.hidden).map((n) => n.dataset.night);
  };

  it("on the Wednesday, shows Wednesday to Sunday: not next Tuesday or the weekend after", () => {
    expect(shownOn("2026-11-11")).toEqual(["2026-11-11", "2026-11-13"]);
  });

  it("on the Sunday, with nothing on, says so; nothing from next week shows", () => {
    expect(shownOn("2026-11-15")).toEqual([]);
    expect(empty()).toBe(false);
  });

  it("on the Monday after, with no new build, shows the new week from the spares", () => {
    expect(shownOn("2026-11-16")).toEqual(["2026-11-17", "2026-11-21"]);
    expect(empty()).toBe(true);
  });

  it("keeps the weekend run on its Sunday, and drops it the Monday after", () => {
    expect(shownOn("2026-11-22")).toEqual(["2026-11-21"]);
    expect(shownOn("2026-11-23")).toEqual([]);
  });
});
