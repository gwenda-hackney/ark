import { describe, expect, it } from "vitest";
import {
  formatSuccessMessage,
  isValidEmail,
  pillTotalToStored,
  storedToPillTotal,
} from "./rsvp-guest-form.js";

describe("pillTotalToStored", () => {
  it("stores headcount from pill value", () => {
    expect(pillTotalToStored(1)).toBe(1);
    expect(pillTotalToStored(6)).toBe(6);
  });

  it("rejects empty or zero pills", () => {
    expect(pillTotalToStored(null)).toBeNull();
    expect(pillTotalToStored(0)).toBeNull();
  });
});

describe("storedToPillTotal", () => {
  it("returns null when not attending", () => {
    expect(storedToPillTotal(0)).toBeNull();
  });

  it("maps stored totals back to pills", () => {
    expect(storedToPillTotal(3)).toBe(3);
    expect(storedToPillTotal(5)).toBe(6);
    expect(storedToPillTotal(6)).toBe(6);
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

describe("formatSuccessMessage", () => {
  it("thanks a decline", () => {
    expect(formatSuccessMessage({ attending: false, guests: 0 })).toMatch(/sorry you can't make it/i);
  });

  it("confirms a solo yes", () => {
    expect(formatSuccessMessage({ attending: true, guests: 1 })).toMatch(/on the list/i);
  });

  it("counts a group", () => {
    expect(formatSuccessMessage({ attending: true, guests: 3 })).toMatch(/3 of you/i);
  });

  it("caps at a party of five plus", () => {
    expect(formatSuccessMessage({ attending: true, guests: 6 })).toMatch(/5 or more/i);
  });
});
