// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { initOccasionField } from "./occasion-field.js";

function form() {
  document.body.innerHTML = `<form id="contact-form">
    <input type="hidden" name="occasion" value="" data-occasion-field />
    <p data-occasion-note hidden>About: <strong data-occasion-name></strong></p>
  </form>`;
  return document.getElementById("contact-form");
}

describe("the occasion a party enquiry came from (#353)", () => {
  it("is filled from the address and said over the form", () => {
    const el = form();
    initOccasionField(el, "?occasion=Christmas%20parties");
    expect(el.querySelector("[data-occasion-field]").value).toBe(
      "Christmas parties",
    );
    expect(el.querySelector("[data-occasion-note]").hidden).toBe(false);
    expect(el.querySelector("[data-occasion-name]").textContent).toBe(
      "Christmas parties",
    );
  });

  it("says nothing without one", () => {
    const el = form();
    initOccasionField(el, "");
    expect(el.querySelector("[data-occasion-field]").value).toBe("");
    expect(el.querySelector("[data-occasion-note]").hidden).toBe(true);
  });
});
