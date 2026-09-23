import { describe, expect, it } from "vitest";
import {
  scheduleNavItems,
  shouldReloadNavLink,
  whatsOnNavItems,
  withHome,
} from "./site-nav.js";

const nights = [
  { schedule: "repeating", title: "Radio" },
  { schedule: "once", title: "Amo" },
];

describe("withHome", () => {
  it("starts every subpage menu at home", () => {
    expect(withHome([{ href: "/list", label: "Stay close" }])[0]).toEqual({
      href: "/",
      label: "Home",
    });
  });
});

describe("whatsOnNavItems", () => {
  it("lists this page's anchors, then the schedule subpage", () => {
    expect(whatsOnNavItems(nights).map((item) => item.label)).toEqual([
      "Home",
      "Regular events",
      "Special events",
      "Full schedule",
    ]);
    expect(whatsOnNavItems(nights).map((item) => item.href)).toEqual([
      "/",
      "#series",
      "#special",
      "/whats-on/schedule",
    ]);
  });
});

describe("scheduleNavItems", () => {
  it("lists week anchors on this page, not the what's on menu", () => {
    const items = scheduleNavItems([
      { id: "2026-09-21", label: "This week · 21 Sep–27 Sep" },
      { id: "2026-09-28", label: "Next week · 28 Sep–4 Oct" },
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/",
      "#week-2026-09-21",
      "#week-2026-09-28",
    ]);
    expect(items.some((item) => item.href.includes("/whats-on"))).toBe(false);
  });
});

describe("shouldReloadNavLink", () => {
  it("reloads cross-page hashes and keeps in-page anchors in the transition", () => {
    expect(shouldReloadNavLink("/whats-on#series")).toBe(true);
    expect(shouldReloadNavLink("/#story")).toBe(true);
    expect(shouldReloadNavLink("#series")).toBe(false);
    expect(shouldReloadNavLink("#week-2026-09-21")).toBe(false);
    expect(shouldReloadNavLink("/whats-on")).toBe(false);
    expect(shouldReloadNavLink("/")).toBe(false);
  });
});
