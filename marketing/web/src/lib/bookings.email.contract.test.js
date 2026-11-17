/**
 * What the weekly email counts on from bookingsWords (lib/bookings.js):
 * near its end it shows Bookings as the website does (#315), the page's
 * heading and note, then each half's heading, line and button, the button
 * going to that half on the Bookings page
 * (shared/weekly-email/model.js and render.js). It reads `heading`, `note`,
 * and each half's `id`, `heading`, `line`, `cta` and `page`, in order. A
 * change here that would break that section fails here.
 */
import { describe, expect, it } from "vitest";
import { BOOKINGS_PATH, bookingsWords } from "./bookings.js";

describe("bookingsWords: what the weekly email reads", () => {
  const words = bookingsWords();

  it("has the page's heading and note, as words", () => {
    expect(words.heading).toEqual(expect.any(String));
    expect(words.heading.trim()).not.toBe("");
    expect(words.note).toEqual(expect.any(String));
    expect(words.note.trim()).not.toBe("");
  });

  it("has two halves, the party first, then playing here", () => {
    expect(words.halves.map((half) => half.id)).toEqual(["party", "play"]);
  });

  it("gives each half a heading, a line and its button's words, in plain text", () => {
    for (const half of words.halves) {
      for (const key of ["heading", "line", "cta"]) {
        expect(half[key], `${half.id}.${key}`).toEqual(expect.any(String));
        expect(half[key].trim(), `${half.id}.${key}`).not.toBe("");
        expect(half[key], `${half.id}.${key}`).not.toMatch(/[<>]/);
      }
    }
  });

  it("sends each half's button to its own part of the Bookings page", () => {
    expect(BOOKINGS_PATH).toBe("/bookings");
    expect(words.halves.map((half) => half.page)).toEqual(["/bookings#party", "/bookings#play"]);
    // The anchor is the half's id, which the page puts on each half (BookingHalves.astro).
    for (const half of words.halves) expect(half.page).toBe(`${BOOKINGS_PATH}#${half.id}`);
  });
});
