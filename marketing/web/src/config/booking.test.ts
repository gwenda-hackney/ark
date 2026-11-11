import { describe, expect, it } from "vitest";
import { bookingUrl, bookingUrlFor } from "./booking";

describe("booking config", () => {
  it("exposes the OpenTable reservations URL", () => {
    expect(bookingUrl).toContain("opentable.co.uk");
    expect(bookingUrl).toContain("gwenda-reservations");
  });
});

describe("booking a table for one night", () => {
  it("opens OpenTable on that night, at the time it starts", () => {
    expect(bookingUrlFor({ date: "2026-11-12", time: "19:00" })).toBe(
      `${bookingUrl}&dateTime=2026-11-12T19:00`,
    );
  });

  it("keeps the restaurant's own link as it is, so the booking is still the website's", () => {
    const url = new URL(bookingUrlFor({ date: "2026-11-12", time: "19:00" }));
    const plain = new URL(bookingUrl);
    expect(url.pathname).toBe(plain.pathname);
    for (const [name, value] of plain.searchParams) {
      expect(url.searchParams.get(name)).toBe(value);
    }
    expect(url.searchParams.get("dateTime")).toBe("2026-11-12T19:00");
  });

  it("rounds a start time down to OpenTable's half hours", () => {
    const at = (time: string) =>
      new URL(bookingUrlFor({ date: "2026-11-12", time })).searchParams.get(
        "dateTime",
      );
    expect(at("19:45")).toBe("2026-11-12T19:30");
    expect(at("19:29")).toBe("2026-11-12T19:00");
    expect(at("7:15")).toBe("2026-11-12T07:00");
    expect(at("21.30")).toBe("2026-11-12T21:30");
  });

  it("asks for 7pm, OpenTable's own default, when the night has no time", () => {
    for (const time of [undefined, "", "late", "25:00"]) {
      expect(bookingUrlFor({ date: "2026-11-12", time })).toBe(
        `${bookingUrl}&dateTime=2026-11-12T19:00`,
      );
    }
  });

  it("is the plain booking page without a date", () => {
    expect(bookingUrlFor()).toBe(bookingUrl);
    expect(bookingUrlFor({ date: "" })).toBe(bookingUrl);
    expect(bookingUrlFor({ date: "12 Nov", time: "19:00" })).toBe(bookingUrl);
  });
});
