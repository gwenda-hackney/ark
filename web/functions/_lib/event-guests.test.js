import { describe, expect, it } from "vitest";
import { summarizeGuests } from "./event-guests.js";

describe("summarizeGuests", () => {
  it("counts invited, responded, and attending", () => {
    const summary = summarizeGuests([
      {
        rowId: 1,
        name: "Alex",
        contact: "alex@example.com",
        channel: "email",
        token: "abc",
        rsvpGuests: 2,
      },
      {
        rowId: 2,
        name: "Sam",
        contact: "@sam",
        channel: "instagram",
        token: null,
        rsvpGuests: null,
      },
    ]);

    expect(summary.invited).toBe(2);
    expect(summary.responded).toBe(1);
    expect(summary.totalAttending).toBe(2);
    expect(summary.pendingSend).toBe(1);
  });
});
