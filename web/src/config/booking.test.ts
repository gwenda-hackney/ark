import { describe, expect, it } from "vitest";
import { bookingUrl } from "./booking";

describe("booking config", () => {
  it("exposes the OpenTable reservations URL", () => {
    expect(bookingUrl).toContain("opentable.co.uk");
    expect(bookingUrl).toContain("gwenda-reservations");
  });
});
