// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { initSeasonField } from "./season-field.js";

function form() {
  document.body.innerHTML = `<form id="contact-form">
    <input type="hidden" name="season" value="" data-season-field />
    <p data-season-note hidden>About: <strong data-season-name></strong></p>
  </form>`;
  return document.getElementById("contact-form");
}

describe("the season a party enquiry came from (#353)", () => {
  it("is filled from the address and said over the form", () => {
    const el = form();
    initSeasonField(el, "?season=Christmas%20parties");
    expect(el.querySelector("[data-season-field]").value).toBe(
      "Christmas parties",
    );
    expect(el.querySelector("[data-season-note]").hidden).toBe(false);
    expect(el.querySelector("[data-season-name]").textContent).toBe(
      "Christmas parties",
    );
  });

  it("says nothing without one", () => {
    const el = form();
    initSeasonField(el, "");
    expect(el.querySelector("[data-season-field]").value).toBe("");
    expect(el.querySelector("[data-season-note]").hidden).toBe(true);
  });
});
