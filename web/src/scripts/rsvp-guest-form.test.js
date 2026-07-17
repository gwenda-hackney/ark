import { beforeEach, describe, expect, it } from "vitest";
import {
  additionalGuestsToTotal,
  formatSuccessContent,
  formatSuccessMessage,
  isValidEmail,
  prepareRsvpConfirmation,
  revealRsvpConfirmation,
  totalToAdditionalGuests,
} from "./rsvp-guest-form.js";

describe("additionalGuestsToTotal", () => {
  it("stores you plus any additional guests", () => {
    expect(additionalGuestsToTotal(0)).toBe(1);
    expect(additionalGuestsToTotal(1)).toBe(2);
    expect(additionalGuestsToTotal(4)).toBe(5);
    expect(additionalGuestsToTotal(5)).toBe(6);
  });

  it("rejects invalid counts", () => {
    expect(additionalGuestsToTotal(null)).toBeNull();
    expect(additionalGuestsToTotal(-1)).toBeNull();
    expect(additionalGuestsToTotal(6)).toBeNull();
  });
});

describe("totalToAdditionalGuests", () => {
  it("returns null when not attending", () => {
    expect(totalToAdditionalGuests(0)).toBeNull();
  });

  it("maps stored totals back to additional guest pills", () => {
    expect(totalToAdditionalGuests(1)).toBe(0);
    expect(totalToAdditionalGuests(3)).toBe(2);
    expect(totalToAdditionalGuests(6)).toBe(5);
  });
});

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("dan@example.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("formatSuccessContent", () => {
  it("thanks a decline with editorial structure", () => {
    const content = formatSuccessContent({ attending: false });
    expect(content.eyebrow).toBe("Gwenda");
    expect(content.title).toMatch(/thanks for letting us know/i);
    expect(content.lead).toMatch(/sorry you can't make it/i);
  });

  it("confirms a yes without repeating party size", () => {
    const content = formatSuccessContent({ attending: true, guests: 3 });
    expect(content.eyebrow).toMatch(/on the list/i);
    expect(content.title).toMatch(/see you there/i);
    expect(content.lead).toMatch(/ticket link/i);
    expect(content.lead).not.toMatch(/guest/i);
  });
});

describe("formatSuccessMessage", () => {
  it("joins lead copy for legacy callers", () => {
    expect(formatSuccessMessage({ attending: true })).toMatch(/ticket link/i);
    expect(formatSuccessMessage({ attending: true })).toMatch(/see you there/i);
  });
});

/**
 * @vitest-environment jsdom
 */
describe("rsvp confirmation reveal", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <header id="rsvp-event-header"></header>
      <div id="rsvp-attend-step"></div>
      <div id="rsvp-details"></div>
      <button id="rsvp-submit"></button>
      <div id="rsvp-confirmation" class="reveal" hidden>
        <p id="rsvp-success-eyebrow"></p>
        <h1 id="rsvp-success-title"></h1>
        <p id="rsvp-success-lead"></p>
        <a href="/" id="rsvp-explore-link">Explore Gwenda</a>
      </div>
    `;
  });

  it("stages confirmation copy and hides the invite details", () => {
    prepareRsvpConfirmation({ attending: true });

    expect(document.getElementById("rsvp-confirmation")?.hidden).toBe(false);
    expect(document.getElementById("rsvp-success-eyebrow")?.textContent).toMatch(/on the list/i);
    expect(document.getElementById("rsvp-success-title")?.textContent).toMatch(/see you there/i);
    expect(document.getElementById("rsvp-success-lead")?.textContent).toMatch(/ticket link/i);
    expect(document.getElementById("rsvp-confirmation")?.classList.contains("visible")).toBe(false);
    expect(document.getElementById("rsvp-event-header")?.hidden).toBe(true);
  });

  it("adds visible for the rise transition", () => {
    prepareRsvpConfirmation({ attending: true });
    revealRsvpConfirmation();

    expect(document.getElementById("rsvp-confirmation")?.classList.contains("visible")).toBe(false);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          expect(document.getElementById("rsvp-confirmation")?.classList.contains("visible")).toBe(
            true,
          );
          resolve();
        });
      });
    });
  });
});
