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
