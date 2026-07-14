import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchEventBySlug,
  publicEventFields,
  sanityDatasetForEnv,
} from "./sanity-event.js";

describe("sanityDatasetForEnv", () => {
  it("uses staging development dataset", () => {
    expect(sanityDatasetForEnv({ SITE_ENV: "staging" })).toBe("development");
  });

  it("prefers explicit SANITY_DATASET", () => {
    expect(sanityDatasetForEnv({ SANITY_DATASET: "production" })).toBe("production");
  });
});

describe("fetchEventBySlug", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for empty slug", async () => {
    await expect(fetchEventBySlug({}, "")).resolves.toBeNull();
  });

  it("maps Sanity event fields including channels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            title: "Private launch party",
            description: "An intimate evening",
            date: "2026-08-15",
            venue: "Schwartz Wharf, Hackney Wick",
            ticketStart: "17:00",
            ticketEnd: "23:00",
            heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
            slug: "private-launch-party",
            channels: [
              { label: "Dan - WhatsApp", token: "A".repeat(32) },
              { label: "", token: null },
            ],
            rsvpConfirmation: {
              subject: "You're on the list · Gwenda",
              heading: "You're on the list",
              body: "Hi {name}",
            },
          },
        }),
      }),
    );

    const event = await fetchEventBySlug(
      { SANITY_DATASET: "development" },
      "private-launch-party",
    );
    expect(event).toEqual({
      title: "Private launch party",
      description: "An intimate evening",
      date: "2026-08-15",
      venue: "Schwartz Wharf, Hackney Wick",
      ticketStart: "17:00",
      ticketEnd: "23:00",
      heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
      slug: "private-launch-party",
      channels: [{ label: "Dan - WhatsApp", token: "a".repeat(32) }],
      rsvpConfirmation: {
        subject: "You're on the list · Gwenda",
        heading: "You're on the list",
        body: "Hi {name}",
      },
    });
    expect(publicEventFields(event)).toEqual({
      title: "Private launch party",
      description: "An intimate evening",
      date: "2026-08-15",
      venue: "Schwartz Wharf, Hackney Wick",
      heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
    });
  });
});
