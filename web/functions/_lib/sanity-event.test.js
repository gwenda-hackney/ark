import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchEventBySlug, sanityDatasetForEnv } from "./sanity-event.js";

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

  it("maps Sanity event fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            title: "Private Launch Party",
            description: "An intimate evening",
            date: "2026-08-15",
            heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
          },
        }),
      }),
    );

    const event = await fetchEventBySlug(
      { SANITY_DATASET: "development" },
      "private-launch-party",
    );
    expect(event).toEqual({
      title: "Private Launch Party",
      description: "An intimate evening",
      date: "2026-08-15",
      heroImageUrl: "https://cdn.sanity.io/images/demo/hero.jpg",
    });
  });
});
