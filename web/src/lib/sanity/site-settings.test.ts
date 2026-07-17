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
        fetch: async () => ({ bookingEnabled: true }),
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({ bookingEnabled: true });
  });

  it("returns bookingEnabled false when Sanity says so", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => ({ bookingEnabled: false }),
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({ bookingEnabled: false });
  });

  it("defaults to bookingEnabled false when the document is missing", async () => {
    vi.doMock("./client", () => ({
      createSanityClient: () => ({
        fetch: async () => null,
      }),
    }));
    const { fetchSiteSettings } = await import("./site-settings");
    await expect(fetchSiteSettings()).resolves.toEqual({ bookingEnabled: false });
  });
});
