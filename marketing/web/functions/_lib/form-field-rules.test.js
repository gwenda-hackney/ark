import { describe, expect, it } from "vitest";
import {
  formatErrorForFieldValue,
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
    expect(isValidInstagramOrLink("https://instagram.com/disco_kid")).toBe(true);
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
});
