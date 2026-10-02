import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("fetchSiteSettings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns bookingEnabled true when Sanity says so", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => ({
          bookingEnabled: true,
          cocktailGalleryEnabled: true,
        }),
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({
      bookingEnabled: true,
      cocktailGalleryEnabled: true,
    });
  });

  it("returns bookingEnabled false when Sanity says so", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => ({
          bookingEnabled: false,
          cocktailGalleryEnabled: true,
        }),
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({
      bookingEnabled: false,
      cocktailGalleryEnabled: true,
    });
  });

  it("returns cocktailGalleryEnabled false when Sanity says so", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => ({
          bookingEnabled: false,
          cocktailGalleryEnabled: false,
        }),
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({
      bookingEnabled: false,
      cocktailGalleryEnabled: false,
    });
  });

  it("defaults cocktailGalleryEnabled true when the field is missing", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => ({ bookingEnabled: false }),
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({
      bookingEnabled: false,
      cocktailGalleryEnabled: true,
    });
  });

  it("defaults when the document is missing", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => null,
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({
      bookingEnabled: false,
      cocktailGalleryEnabled: true,
    });
  });
});
