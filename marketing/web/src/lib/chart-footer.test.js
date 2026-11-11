import { describe, expect, it } from "vitest";
import { CHART_SECTIONS } from "./chart-nav.js";
import {
  FOOT_LINKS,
  mapsSearchUrl,
  phoneHref,
  phoneText,
} from "./chart-footer.js";

describe("FOOT_LINKS", () => {
  it("is Photos, Play here and About", () => {
    expect(FOOT_LINKS).toEqual([
      { label: "Photos", href: "/photos" },
      { label: "Play here", href: "/contact/play" },
      { label: "About", href: "/about" },
    ]);
  });

  it("never repeats a place the navigation carries", () => {
    const nav = new Set(CHART_SECTIONS.map((section) => section.href));
    for (const link of FOOT_LINKS) expect(nav.has(link.href)).toBe(false);
  });
});

describe("mapsSearchUrl", () => {
  it("searches Google Maps for the place by name and address", () => {
    const url = new URL(
      mapsSearchUrl({
        name: "Gwenda",
        address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.google.com/maps/search/",
    );
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(
      "Gwenda, Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
    );
  });
});

describe("phone", () => {
  it("dials the number from anywhere", () => {
    expect(phoneHref("+44 20 4637 4754")).toBe("tel:+442046374754");
  });

  it("writes it as people in London read it", () => {
    expect(phoneText("+44 20 4637 4754")).toBe("020 4637 4754");
  });
});
