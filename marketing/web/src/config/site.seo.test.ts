import { describe, expect, it } from "vitest";
import { siteConfig } from "./site";

describe("site SEO config", () => {
  it("gives each indexable page a unique title and description", () => {
    const pages = Object.values(siteConfig.seo);
    const titles = pages.map((p) => p.title);
    const descriptions = pages.map((p) => p.description);

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("avoids em dashes in SEO titles", () => {
    for (const page of Object.values(siteConfig.seo)) {
      expect(page.title).not.toMatch(/—|--/);
    }
  });

  it("keeps meta descriptions in a useful length range", () => {
    for (const page of Object.values(siteConfig.seo)) {
      expect(page.description.length).toBeGreaterThan(40);
      expect(page.description.length).toBeLessThanOrEqual(160);
    }
  });
});
