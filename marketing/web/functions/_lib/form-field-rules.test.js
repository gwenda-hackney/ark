import { describe, expect, it } from "vitest";
import {
  dateFieldError,
  formatDateAnswer,
  formatErrorForFieldValue,
  londonToday,
  numberFieldError,
  isValidEmail,
  isValidInstagramOrLink,
  isValidPhone,
} from "../../../../shared/forms/field-rules.js";

describe("form-field-rules", () => {
  it("accepts common emails and rejects junk", () => {
    expect(isValidEmail("alex@example.com")).toBe(true);
    expect(isValidEmail("a.b+tag@mail.co.uk")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a@b.c")).toBe(false);
    expect(isValidEmail(".alex@example.com")).toBe(false);
    expect(isValidEmail("alex.@example.com")).toBe(false);
    expect(isValidEmail("alex..b@example.com")).toBe(false);
    expect(isValidEmail("alex@-example.com")).toBe(false);
    expect(isValidEmail("alex@example")).toBe(false);
  });

  it("accepts international phone shapes", () => {
    expect(isValidPhone("+44 7700 900123")).toBe(true);
    expect(isValidPhone("07700900123")).toBe(true);
    expect(isValidPhone("+1 (212) 555-0199")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("not a phone")).toBe(false);
  });

  it("accepts instagram handles and links", () => {
    expect(isValidInstagramOrLink("@disco_kid")).toBe(true);
    expect(isValidInstagramOrLink("disco_kid")).toBe(true);
    expect(isValidInstagramOrLink("https://instagram.com/disco_kid")).toBe(
      true,
    );
    expect(isValidInstagramOrLink("https://www.instagram.com/disco_kid/")).toBe(
      true,
    );
    expect(isValidInstagramOrLink("instagram.com/disco_kid")).toBe(true);
    expect(isValidInstagramOrLink("https://linktr.ee/disco")).toBe(true);
    expect(isValidInstagramOrLink("bad handle!")).toBe(false);
    expect(isValidInstagramOrLink("https://")).toBe(false);
  });

  it("formatErrorForFieldValue maps keys", () => {
    expect(
      formatErrorForFieldValue({
        key: "email",
        type: "email",
        label: "Email",
        value: "nope",
      }),
    ).toMatch(/email|full/i);
    expect(
      formatErrorForFieldValue({
        key: "phone",
        type: "tel",
        label: "Phone",
        value: "12",
      }),
    ).toMatch(/phone/i);
    expect(
      formatErrorForFieldValue({
        key: "instagram",
        type: "text",
        label: "Instagram",
        value: "!!",
      }),
    ).toMatch(/handle|link/i);
    expect(
      formatErrorForFieldValue({
        key: "instagram",
        type: "text",
        label: "Instagram",
        value: "@ok",
      }),
    ).toBe("");
  });

  it("takes a date from today, at the bar, to two years on", () => {
    const today = "2026-11-11";
    const ok = (value) => dateFieldError(value, { label: "Date", today });
    expect(ok("2026-11-11")).toBe("");
    expect(ok("2026-12-31")).toBe("");
    expect(ok("2028-11-10")).toBe("");
    expect(ok("2026-11-10")).toMatch(/that day has gone/);
    expect(ok("2028-11-12")).toMatch(/next two years/);
    // Not a day at all
    for (const value of [
      "2026-02-30",
      "2026-13-01",
      "12/12/2026",
      "soon",
      "",
    ]) {
      expect(ok(value), value).toMatch(/pick a date/);
    }
  });

  it("counts today in London, not UTC", () => {
    // 23:30 UTC on 30 June is already 1 July in London (summer time)
    expect(londonToday(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(londonToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("reads a date back as a day", () => {
    expect(formatDateAnswer("2026-12-12")).toBe("Saturday 12 December 2026");
    expect(formatDateAnswer("some time")).toBe("some time");
  });

  it("takes a whole number from 1 to 1000", () => {
    const ok = (value) => numberFieldError(value, { label: "How many people" });
    for (const value of ["1", "30", "1000", " 12 "]) expect(ok(value)).toBe("");
    for (const value of ["0", "1001", "-4", "12.5", "1e3", "twelve", "30ish"]) {
      expect(ok(value), value).toMatch(/How many people: enter a whole number/);
    }
  });

  it("formatErrorForFieldValue checks date and number fields by type", () => {
    expect(
      formatErrorForFieldValue({
        key: "date",
        type: "date",
        label: "Preferred date",
        value: "2020-01-01",
        today: "2026-11-11",
      }),
    ).toMatch(/Preferred date/);
    expect(
      formatErrorForFieldValue({
        key: "people",
        type: "number",
        label: "How many people",
        value: "40",
      }),
    ).toBe("");
  });
});
