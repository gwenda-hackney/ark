import { describe, expect, it } from "vitest";
import {
  artistNavItems,
  homeAnchorItems,
  shouldReloadNavLink,
  sitePageLinks,
  whatsOnNavItems,
  withHome,
} from "./site-nav.js";

const nights = [
  { schedule: "repeating", title: "Radio" },
  { schedule: "once", title: "Amo" },
];

describe("withHome", () => {
  it("starts every subpage menu at home", () => {
    expect(withHome([{ href: "/join-list", label: "Stay close" }])[0]).toEqual({
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

describe("artistNavItems", () => {
  it("lists galleries only when that artist has pictures", () => {
    expect(artistNavItems({ art: [], gwenda: [] }).map((item) => item.href)).toEqual([
      "/",
    ]);
    expect(
      artistNavItems({
        art: [{ url: "https://files.example/work.jpg" }],
        gwenda: [{ url: "https://files.example/room.jpg" }],
      }).map((item) => item.label),
    ).toEqual(["Home", "At Gwenda", "More"]);
  });
});

describe("homeAnchorItems", () => {
  it("lists this page's sections, with the join link last", () => {
    expect(homeAnchorItems({ showMenu: true, showTeam: true }).map((item) => item.href)).toEqual([
      "#story",
      "#menu",
      "#what-we-do",
      "#list",
    ]);
    expect(homeAnchorItems({ showMenu: true, showTeam: true }).map((item) => item.label)).toEqual([
      "Behind the doors",
      "Menu",
      "What's on",
      "Join the experience",
    ]);
    expect(homeAnchorItems({ showTeam: true }).at(-1)).toMatchObject({
      href: "#list",
      cta: true,
    });
  });

  it("adds the gallery anchor only when that section is on the page", () => {
    expect(
      homeAnchorItems({ showTeam: true, showGallery: true }).map(
        (item) => item.href,
      ),
    ).toEqual(["#story", "#what-we-do", "#glimpse", "#list"]);
    expect(homeAnchorItems({ showTeam: true }).some((item) => item.href === "#team")).toBe(
      false,
    );
    expect(homeAnchorItems().some((item) => item.href === "#menu")).toBe(false);
  });
});

describe("sitePageLinks", () => {
  it("lists every subpage from home", () => {
    expect(sitePageLinks("/").map((item) => item.href)).toEqual([
      "/menu",
      "/whats-on",
      "/artists/current",
      "/contact",
    ]);
  });

  it("drops the page you are on, and keeps the parent of a child route", () => {
    expect(sitePageLinks("/menu").map((item) => item.label)).toEqual([
      "What's on",
      "Featured artist",
      "Contact",
    ]);
    expect(sitePageLinks("/menu/").some((item) => item.href === "/menu")).toBe(
      false,
    );
    expect(
      sitePageLinks("/whats-on/schedule").some(
        (item) => item.href === "/whats-on",
      ),
    ).toBe(true);
    expect(
      sitePageLinks("/whats-on").some((item) => item.href === "/whats-on"),
    ).toBe(false);
    expect(
      sitePageLinks("/artists/current").some(
        (item) => item.href === "/artists/current",
      ),
    ).toBe(false);
    expect(
      sitePageLinks("/artists/ada").some(
        (item) => item.href === "/artists/current",
      ),
    ).toBe(true);
  });

  it("omits Menu when the home header does not show it", () => {
    expect(sitePageLinks("/", { showMenu: false }).map((item) => item.href)).toEqual([
      "/whats-on",
      "/artists/current",
      "/contact",
    ]);
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
