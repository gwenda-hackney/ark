import { afterEach, describe, expect, it, vi } from "vitest";
import { getGuestByIdForEvent } from "./event-guests.js";

describe("getGuestByIdForEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses RSVP Guests even though Baserow's REST API returns it as a string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        const href = String(url);
        if (href.includes("all-tables")) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 555, name: "Event Invites", database_id: 1 }],
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 9,
            Name: "Test Guest",
            "Event Slug": "private-launch-party",
            Channel: { value: "Email" },
            Contact: "test@example.com",
            Token: null,
            "RSVP Guests": "2",
            "RSVP Updated": "2026-07-14",
          }),
        });
      }),
    );

    const env = { BASEROW_API_KEY: "test-key-guest-count" };
    const result = await getGuestByIdForEvent(env, "private-launch-party", 9);

    expect(result.ok).toBe(true);
    expect(result.guest.rsvpGuests).toBe(2);
  });

  it("returns null when the row belongs to a different event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        const href = String(url);
        if (href.includes("all-tables")) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 556, name: "Event Invites", database_id: 1 }],
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 9,
            Name: "Test Guest",
            "Event Slug": "some-other-event",
            "RSVP Guests": "2",
          }),
        });
      }),
    );

    const env = { BASEROW_API_KEY: "test-key-guest-mismatch" };
    const result = await getGuestByIdForEvent(env, "private-launch-party", 9);

    expect(result.ok).toBe(true);
    expect(result.guest).toBeNull();
  });
});
