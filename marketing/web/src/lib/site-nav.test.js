import { describe, expect, it } from "vitest";
import {
  artistNavItems,
  homeAnchorItems,
  parentHref,
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
  it("keeps this page's links and drops Home", () => {
    expect(
      withHome([
        { href: "/", label: "Home" },
        { href: "/join-list", label: "Stay close" },
      ]),
    ).toEqual([{ href: "/join-list", label: "Stay close" }]);
  });
});

describe("parentHref", () => {
  it("steps one level up, skipping redirect-only parents", () => {
    expect(parentHref("/")).toBe("");
    expect(parentHref("/menu")).toBe("/");
    expect(parentHref("/whats-on/schedule")).toBe("/whats-on");
    expect(parentHref("/whats-on/radio/2026-09-24")).toBe("/whats-on/radio");
    expect(parentHref("/whats-on/radio/2026-09-24/ticket")).toBe(
      "/whats-on/radio/2026-09-24",
    );
    expect(parentHref("/artists/current")).toBe("/");
    expect(parentHref("/artists/ada")).toBe("/artists/current");
    expect(parentHref("/events/opening")).toBe("/whats-on");
    expect(parentHref("/events/opening/ticket")).toBe("/events/opening");
    expect(parentHref("/contact/edit")).toBe("/contact");
  });
});

describe("whatsOnNavItems", () => {
  it("lists this page's anchors, then the schedule subpage", () => {
    expect(whatsOnNavItems(nights).map((item) => item.label)).toEqual([
      "Special events",
      "Regular events",
      "Full schedule",
    ]);
    expect(whatsOnNavItems(nights).map((item) => item.href)).toEqual([
      "#special",
      "#series",
      "/whats-on/schedule",
    ]);
  });
});

describe("artistNavItems", () => {
  it("lists galleries only when that artist has pictures", () => {
    expect(
      artistNavItems({ art: [], gwenda: [] }).map((item) => item.href),
    ).toEqual([]);
    expect(
      artistNavItems({
        art: [{ url: "https://files.example/work.jpg" }],
        gwenda: [{ url: "https://files.example/room.jpg" }],
      }).map((item) => item.label),
    ).toEqual(["At Gwenda", "More"]);
  });
});

describe("homeAnchorItems", () => {
  it("lists this page's sections, with the join link last", () => {
    expect(
      homeAnchorItems({ showMenu: true, showTeam: true }).map(
        (item) => item.href,
      ),
    ).toEqual(["#what-we-do", "#menu", "#find-us", "#story", "#list"]);
    expect(
      homeAnchorItems({ showMenu: true, showTeam: true }).map(
        (item) => item.label,
      ),
    ).toEqual([
      "What's on",
      "Menu",
      "Find us",
      "On the canal",
      "Get on the list",
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
    ).toEqual(["#what-we-do", "#find-us", "#story", "#glimpse", "#list"]);
    expect(
      homeAnchorItems({ showTeam: true }).some((item) => item.href === "#team"),
    ).toBe(false);
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
    expect(
      sitePageLinks("/", { showMenu: false }).map((item) => item.href),
    ).toEqual(["/whats-on", "/artists/current", "/contact"]);
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
