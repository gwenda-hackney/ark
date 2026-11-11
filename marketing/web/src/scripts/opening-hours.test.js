/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initOpeningHours } from "./opening-hours.js";

const WEEK = [
  { day: "mon", closed: true },
  { day: "tue", closed: false, opens: "17:00", closes: "22:00" },
  { day: "wed", closed: false, opens: "17:00", closes: "22:30" },
  { day: "thu", closed: false, opens: "17:00", closes: "22:30" },
  { day: "fri", closed: false, opens: "16:00", closes: "23:30" },
  { day: "sat", closed: false, opens: "16:00", closes: "01:00" },
  { day: "sun", closed: false, opens: "16:00", closes: "22:00" },
];

function page(week) {
  document.body.innerHTML = `<p data-hours-today data-week='${JSON.stringify(week)}' hidden></p>`;
  return document.querySelector("[data-hours-today]");
}

describe("today's line in the browser", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("fills in the line for the moment the page is opened, and shows it", () => {
    const line = page(WEEK);
    initOpeningHours(new Date("2026-11-15T00:30:00Z"));
    expect(line.textContent).toBe("Open now till 1am");
    expect(line.hidden).toBe(false);
    expect(line.dataset.open).toBe("true");

    initOpeningHours(new Date("2026-11-09T12:00:00Z"));
    expect(line.textContent).toBe("Closed today, open Tuesday from 5pm");
    expect(line.dataset.open).toBe("false");
  });

  it("stays hidden when the week is missing or broken", () => {
    const line = page(null);
    initOpeningHours(new Date("2026-11-10T12:00:00Z"));
    expect(line.hidden).toBe(true);
    line.dataset.week = "{not json";
    initOpeningHours(new Date("2026-11-10T12:00:00Z"));
    expect(line.hidden).toBe(true);
  });
});
