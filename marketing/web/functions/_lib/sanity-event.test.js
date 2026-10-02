import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchEventBySlug,
  publicEventFields,
  sanityDatasetForEnv,
} from "./sanity-event.js";
import { sanityPerspectiveForEnv } from "./sanity-query.js";

describe("sanityDatasetForEnv", () => {
  it("reads the one dataset, whichever site this is", () => {
    expect(sanityDatasetForEnv({ SITE_ENV: "preview" })).toBe("production");
    expect(sanityDatasetForEnv({})).toBe("production");
  });

  it("prefers explicit SANITY_DATASET", () => {
    expect(sanityDatasetForEnv({ SANITY_DATASET: "other" })).toBe("other");
  });
});

describe("sanityPerspectiveForEnv", () => {
  it("hides drafts on the live site", () => {
    expect(sanityPerspectiveForEnv({ SITE_ENV: "production" })).toBe(
      "published",
    );
    expect(sanityPerspectiveForEnv({})).toBe("published");
  });

  it("overlays drafts on the preview and a local dev server", () => {
    expect(sanityPerspectiveForEnv({ SITE_ENV: "preview" })).toBe(
      "previewDrafts",
    );
    expect(sanityPerspectiveForEnv({ SITE_ENV: "local" })).toBe(
      "previewDrafts",
    );
  });

  it("follows an explicit SANITY_PERSPECTIVE", () => {
    expect(
      sanityPerspectiveForEnv({
        SITE_ENV: "production",
        SANITY_PERSPECTIVE: "previewDrafts",
      }),
    ).toBe("previewDrafts");
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
            title: "Launch Party",
            eventType: "private",
            description: "An intimate evening",
            offer: "£10 Negroni",
            date: "2026-08-15",
            time: "Two sessions",
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
      { SITE_ENV: "production" },
      "private-launch-party",
    );
    const requested = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(requested).toContain("perspective=published");
    expect(event).toEqual({
      title: "Launch Party",
      eventType: "private",
      description: "An intimate evening",
      offer: "£10 Negroni",
      date: "2026-08-15",
      time: "Two sessions",
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
      title: "Launch Party",
      eventType: "private",
      description: "An intimate evening",
      offer: "£10 Negroni",
      date: "2026-08-15",
      time: "Two sessions",
      venue: "Schwartz Wharf, Hackney Wick",
      ticketStart: "17:00",
      ticketEnd: "23:00",
      heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
    });
  });

  it("flattens portable text in publicEventFields", () => {
    const event = {
      title: "Launch Party",
      eventType: "private",
      description: [
        {
          _type: "block",
          children: [{ _type: "span", text: "First paragraph." }],
        },
        {
          _type: "block",
          children: [{ _type: "span", text: "Second paragraph." }],
        },
      ],
      date: "2026-08-15",
      venue: "Schwartz Wharf, Hackney Wick",
      ticketStart: "17:00",
      ticketEnd: "23:00",
      heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
    };

    expect(publicEventFields(event)?.description).toBe(
      "First paragraph.\n\nSecond paragraph.",
    );
  });
});
