import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  canonicalizePath,
  editorKey,
  editorClosePath,
  editorReturnTo,
  eventItemPath,
  eventListPath,
  eventNewPath,
  eventTabPath,
  inventoryItemPath,
  isClientNavPath,
  isEditorPath,
  isSpaDocumentPath,
  menuItemPath,
  menuItemPrintPath,
  menuNewPath,
  menuPrintPath,
  menuTabPath,
  navigationLeavesEditor,
  parseShellPath,
  shellCrumbs,
  shellPageKey,
  shouldReplaceNav,
} from "./spa-path.js";

describe("spa-path", () => {
  it("canonicalizes hash leftovers into real paths", () => {
    assert.equal(canonicalizePath("/#/menu"), "/menu");
    assert.equal(canonicalizePath("/#/menu/negroni"), "/menu/negroni");
    assert.equal(canonicalizePath("/#/menu/negroni/recipe"), "/menu/negroni/recipe");
    assert.equal(canonicalizePath("/menu/#/menu"), "/menu");
    assert.equal(canonicalizePath("/menu/"), "/menu");
    assert.equal(canonicalizePath("/inventory/new"), "/inventory/new");
    assert.equal(canonicalizePath("/#/inventory/gin"), "/inventory/gin");
  });

  it("parses recipe and inventory detail routes by name slug", () => {
    assert.deepEqual(parseShellPath("/menu"), {
      page: "menu",
      slug: null,
      isNew: false,
      tab: null,
    });
    assert.deepEqual(parseShellPath("/menu/new"), {
      page: "menu",
      slug: null,
      isNew: true,
      tab: "details",
    });
    assert.deepEqual(parseShellPath("/menu/espresso-martini"), {
      page: "menu",
      slug: "espresso-martini",
      isNew: false,
      tab: "details",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/recipe"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: "details",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/pos"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: "menu",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/menu"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: "menu",
    });
    assert.deepEqual(parseShellPath("/menu/new/analysis"), {
      page: "menu",
      slug: null,
      isNew: true,
      tab: "analysis",
    });
    assert.deepEqual(parseShellPath("/menu/print"), {
      page: "menu",
      slug: null,
      isNew: false,
      tab: null,
      print: true,
      printFilter: "cocktail",
    });
    assert.deepEqual(parseShellPath("/menu/print/beer"), {
      page: "menu",
      slug: null,
      isNew: false,
      tab: null,
      print: true,
      printFilter: "beer",
    });
    assert.deepEqual(parseShellPath("/menu/print/bogus"), {
      page: "menu",
      slug: null,
      isNew: false,
      tab: null,
      print: true,
      printFilter: "cocktail",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/print"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: null,
      print: true,
      printFilter: "all",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/cost"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: "cost",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/details"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: "details",
    });
    assert.deepEqual(parseShellPath("/menu/negroni/bogus"), {
      page: "menu",
      slug: "negroni",
      isNew: false,
      tab: "details",
    });
    assert.deepEqual(parseShellPath("/inventory/bombay-gin"), {
      page: "inventory",
      slug: "bombay-gin",
      isNew: false,
    });
    assert.equal(shellPageKey("/menu/negroni"), "menu");
    assert.equal(shellPageKey("/menu/negroni/recipe"), "menu");
    assert.equal(menuItemPath("Espresso Martini"), "/menu/espresso-martini");
    assert.equal(menuItemPath("Negroni", "recipe"), "/menu/negroni");
    assert.equal(menuItemPath("Negroni", "details"), "/menu/negroni");
    assert.equal(menuNewPath("analysis"), "/menu/new/analysis");
    assert.equal(menuPrintPath(), "/menu/print");
    assert.equal(menuPrintPath("cocktail"), "/menu/print");
    assert.equal(menuPrintPath("beer"), "/menu/print/beer");
    assert.equal(menuItemPrintPath("Negroni"), "/menu/negroni/print");
    assert.equal(menuTabPath("/menu/negroni/recipe", "analysis"), "/menu/negroni/analysis");
    assert.equal(inventoryItemPath("Bombay Sapphire"), "/inventory/bombay-sapphire");
  });

  it("treats print book as a document path, not an editor", () => {
    assert.equal(isSpaDocumentPath("/menu/print"), true);
    assert.equal(isSpaDocumentPath("/menu/print/beer"), true);
    assert.equal(isSpaDocumentPath("/menu/negroni/print"), true);
    assert.equal(isEditorPath("/menu/print"), false);
    assert.equal(isEditorPath("/menu/print/all"), false);
    assert.equal(isEditorPath("/menu/negroni/print"), false);
  });

  it("rewrites only shell document paths, not static tools", () => {
    assert.equal(isSpaDocumentPath("/menu"), true);
    assert.equal(isSpaDocumentPath("/menu/negroni"), true);
    assert.equal(isSpaDocumentPath("/menu/negroni/recipe"), true);
    assert.equal(isSpaDocumentPath("/inventory/gin"), true);
    assert.equal(isSpaDocumentPath("/lightspeed"), true);
    assert.equal(isSpaDocumentPath("/lightspeed/export"), true);
    assert.equal(isSpaDocumentPath("/lightspeed/menus"), true);
    assert.equal(isSpaDocumentPath("/suppliers"), true);
    assert.equal(isSpaDocumentPath("/config"), true);
    assert.equal(isSpaDocumentPath("/sections"), true);
    assert.equal(isSpaDocumentPath("/users"), true);
    assert.equal(isSpaDocumentPath("/events"), true);
    assert.equal(isSpaDocumentPath("/artists"), true);
    assert.equal(isSpaDocumentPath("/events/nights"), true);
    assert.equal(isSpaDocumentPath("/events/schedule"), true);
    assert.equal(isSpaDocumentPath("/events/new"), true);
    assert.equal(isSpaDocumentPath("/web"), true);
    assert.equal(isSpaDocumentPath("/forms"), true);
    assert.equal(isSpaDocumentPath("/tools/breakeven"), true);
    assert.equal(isSpaDocumentPath("/stock"), false);
    assert.equal(isSpaDocumentPath("/api/menu"), false);
    assert.equal(isClientNavPath("/config"), true);
    assert.equal(isClientNavPath("/lightspeed"), true);
    assert.equal(isClientNavPath("/lightspeed/export"), true);
    assert.equal(isClientNavPath("/lightspeed/menus"), true);
    assert.equal(isClientNavPath("/suppliers"), true);
    assert.equal(isClientNavPath("/sections"), true);
    assert.equal(isClientNavPath("/users"), true);
    assert.equal(isClientNavPath("/web"), true);
    assert.equal(isClientNavPath("/forms"), true);
    assert.equal(isClientNavPath("/artists"), true);
    assert.equal(isClientNavPath("/tools/cashflow"), true);
    assert.equal(isClientNavPath("/stock"), false);
    assert.equal(isClientNavPath("/stock/index.html"), false);
    assert.equal(shellPageKey("/config"), "config");
    assert.equal(shellPageKey("/lightspeed"), "lightspeed");
    assert.equal(shellPageKey("/lightspeed/export"), "lightspeed");
    assert.equal(shellPageKey("/lightspeed/menus"), "lightspeed");
    assert.equal(shellPageKey("/suppliers"), "suppliers");
    assert.equal(shellPageKey("/sections"), "sections");
    assert.equal(shellPageKey("/users"), "users");
    assert.equal(shellPageKey("/events/12"), "events");
    assert.equal(shellPageKey("/artists"), "artists");
    assert.equal(shellPageKey("/events/12/publish"), "events");
    assert.deepEqual(parseShellPath("/events"), {
      page: "events",
      slug: null,
      isNew: false,
      tab: null,
      list: "series",
    });
    assert.deepEqual(parseShellPath("/events/nights"), {
      page: "events",
      slug: null,
      isNew: false,
      tab: null,
      list: "schedule",
    });
    assert.deepEqual(parseShellPath("/events/schedule"), {
      page: "events",
      slug: null,
      isNew: false,
      tab: null,
      list: "schedule",
    });
    assert.equal(canonicalizePath("/events/nights"), "/events/schedule");
    assert.deepEqual(parseShellPath("/events/new/once"), {
      page: "events",
      slug: null,
      isNew: true,
      tab: "details",
      list: null,
      kind: "once",
    });
    assert.equal(eventNewPath("details", { once: true }), "/events/new/once");
    assert.equal(eventTabPath("/events/new/once", "gallery"), "/events/new/once/gallery");
    assert.deepEqual(parseShellPath("/events/new"), {
      page: "events",
      slug: null,
      isNew: true,
      tab: "details",
      list: null,
    });
    assert.deepEqual(parseShellPath("/events/new/schedule"), {
      page: "events",
      slug: null,
      isNew: true,
      tab: "schedule",
      list: null,
    });
    assert.deepEqual(parseShellPath("/events/12"), {
      page: "events",
      slug: "12",
      isNew: false,
      tab: "details",
      list: null,
    });
    // Publishing moved to Website > Preview → live; old links open details.
    assert.deepEqual(parseShellPath("/events/12/publish"), {
      page: "events",
      slug: "12",
      isNew: false,
      tab: "details",
      list: null,
    });
    assert.deepEqual(parseShellPath("/events/12/gallery"), {
      page: "events",
      slug: "12",
      isNew: false,
      tab: "gallery",
      list: null,
    });
    assert.deepEqual(parseShellPath("/events/12/bogus"), {
      page: "events",
      slug: "12",
      isNew: false,
      tab: "details",
      list: null,
    });
    assert.equal(eventListPath(), "/events");
    assert.equal(eventListPath("series"), "/events");
    assert.equal(eventListPath("nights"), "/events/schedule");
    assert.equal(eventListPath("schedule"), "/events/schedule");
    assert.equal(eventItemPath("12"), "/events/12");
    assert.equal(eventItemPath("12@2026-09-25"), "/events/12@2026-09-25");
    assert.equal(eventItemPath("12", "details"), "/events/12");
    assert.equal(eventItemPath("12", "gallery"), "/events/12/gallery");
    assert.equal(eventNewPath("gallery"), "/events/new/gallery");
    assert.equal(eventTabPath("/events/12/schedule", "gallery"), "/events/12/gallery");
    assert.equal(editorKey("/events/12/publish"), "events:12");
    assert.equal(editorKey("/events/new/schedule"), "events:new");
    assert.equal(isEditorPath("/events/12"), true);
    assert.equal(isEditorPath("/events/12/gallery"), true);
    assert.equal(isEditorPath("/events/new"), true);
    assert.equal(isEditorPath("/events"), false);
    assert.equal(isEditorPath("/events/nights"), false);
    assert.equal(isEditorPath("/events/schedule"), false);
    assert.equal(shouldReplaceNav("/events/12", "/events/12/gallery"), true);
    assert.equal(navigationLeavesEditor("/events/12/gallery", "/events/12"), false);
    assert.equal(navigationLeavesEditor("/events/12", "/events"), true);
    assert.equal(shellPageKey("/web"), "web");
    assert.equal(shellPageKey("/forms"), "forms");
    assert.equal(shellPageKey("/forms/12"), "forms");
    assert.deepEqual(parseShellPath("/forms/12"), { page: "forms", slug: "12" });
    assert.equal(shellPageKey("/tools/breakeven"), "tools");
    assert.deepEqual(parseShellPath("/tools/stock"), {
      page: "tools",
      tool: "stock",
    });
    assert.deepEqual(parseShellPath("/tools/nope"), {
      page: "tools",
      tool: "breakeven",
    });
    assert.deepEqual(parseShellPath("/sections"), { page: "sections" });
    assert.deepEqual(parseShellPath("/lightspeed"), {
      page: "lightspeed",
      view: "reconcile",
    });
    assert.deepEqual(parseShellPath("/lightspeed/export"), {
      page: "lightspeed",
      view: "export",
    });
    assert.deepEqual(parseShellPath("/lightspeed/menus"), {
      page: "lightspeed",
      view: "menus",
    });
    assert.deepEqual(parseShellPath("/suppliers"), { page: "suppliers" });
    assert.deepEqual(parseShellPath("/artists"), {
      page: "artists",
      slug: null,
      isNew: false,
    });
    assert.deepEqual(parseShellPath("/artists/new"), {
      page: "artists",
      slug: null,
      isNew: true,
    });
    assert.deepEqual(parseShellPath("/artists/3"), {
      page: "artists",
      slug: "3",
      isNew: false,
    });
    assert.equal(isEditorPath("/artists"), false);
    assert.equal(isEditorPath("/artists/3"), true);
    assert.equal(isEditorPath("/artists/new"), true);
  });

  it("treats drink tabs as the same editor, and list as leaving", () => {
    assert.equal(editorKey("/menu/ambra"), "menu:ambra");
    assert.equal(editorKey("/menu/ambra/analysis"), "menu:ambra");
    assert.equal(editorKey("/menu/new/recipe"), "menu:new");
    assert.equal(editorKey("/menu"), "menu");
    assert.equal(navigationLeavesEditor("/menu/ambra/analysis", "/menu/ambra/recipe"), false);
    assert.equal(navigationLeavesEditor("/menu/ambra", "/menu"), true);
    assert.equal(navigationLeavesEditor("/menu/ambra", "/inventory"), true);
    assert.equal(navigationLeavesEditor("/menu", "/inventory"), false);
    assert.equal(navigationLeavesEditor("/menu", "/sections"), false);
    assert.equal(navigationLeavesEditor("/artists", "/events"), false);
    assert.equal(navigationLeavesEditor("/artists/3", "/artists"), true);
    assert.equal(navigationLeavesEditor("/menu/ambra", "/sections"), true);
  });

  it("sends Close back to the opener, not always the recipes table", () => {
    assert.equal(isEditorPath("/menu/negroni"), true);
    assert.equal(isEditorPath("/menu/negroni/recipe"), true);
    assert.equal(isEditorPath("/menu/new"), true);
    assert.equal(isEditorPath("/inventory/gin"), true);
    assert.equal(isEditorPath("/menu"), false);
    assert.equal(isEditorPath("/"), false);

    assert.equal(editorReturnTo("/", "/menu/negroni"), "/");
    assert.equal(editorReturnTo("/menu", "/menu/negroni"), "/menu");
    assert.equal(editorReturnTo("/menu/negroni", "/menu/negroni/recipe", "/"), "/");
    assert.equal(editorReturnTo("/menu/new", "/menu/negroni", "/"), "/");
    assert.equal(editorReturnTo("/menu/negroni", "/inventory/gin", "/"), "/menu/negroni");
    assert.equal(editorReturnTo("/menu/negroni", "/", "/"), undefined);

    assert.equal(shouldReplaceNav("/menu/negroni", "/menu/negroni/recipe"), true);
    assert.equal(shouldReplaceNav("/", "/menu/negroni"), false);
    assert.equal(shouldReplaceNav("/menu/negroni", "/menu"), false);

    assert.equal(editorClosePath("/menu/negroni", "/", "/menu"), "/");
    assert.equal(editorClosePath("/menu/negroni", "/menu", "/menu"), "/menu");
    assert.equal(editorClosePath("/menu/negroni", undefined, "/menu"), "/menu");
    assert.equal(editorClosePath("/menu/negroni/recipe", "/", "/menu"), "/");
    assert.equal(editorClosePath("/inventory/gin", "/", "/inventory"), "/");
  });

  it("builds a clickable trail for section and detail pages", () => {
    assert.deepEqual(
      shellCrumbs("/", { homeLabel: "Operations", sectionLabel: "Dashboard" }),
      [{ label: "Operations", href: "/" }, { label: "Dashboard" }],
    );
    assert.deepEqual(
      shellCrumbs("/menu", {
        homeLabel: "Operations",
        sectionLabel: "Menu prices",
        sectionHref: "/menu",
      }),
      [{ label: "Operations", href: "/" }, { label: "Menu prices" }],
    );
    assert.deepEqual(
      shellCrumbs("/menu/negroni", {
        homeLabel: "Operations",
        sectionLabel: "Menu prices",
        sectionHref: "/menu",
        leaf: "Negroni",
      }),
      [
        { label: "Operations", href: "/" },
        { label: "Menu prices", href: "/menu" },
        { label: "Negroni" },
      ],
    );
    assert.deepEqual(
      shellCrumbs("/menu/negroni/recipe", {
        homeLabel: "Operations",
        sectionLabel: "Menu prices",
        sectionHref: "/menu",
        leaf: "Negroni",
      }),
      [
        { label: "Operations", href: "/" },
        { label: "Menu prices", href: "/menu" },
        { label: "Negroni" },
      ],
    );
    assert.deepEqual(
      shellCrumbs("/config", {
        homeLabel: "Operations",
        sectionLabel: "Configuration",
        sectionHref: "/config",
      }),
      [{ label: "Operations", href: "/" }, { label: "Configuration" }],
    );
    assert.deepEqual(
      shellCrumbs("/sections", {
        homeLabel: "Operations",
        sectionLabel: "Sections",
        sectionHref: "/sections",
      }),
      [{ label: "Operations", href: "/" }, { label: "Sections" }],
    );
    assert.equal(
      shellCrumbs("/inventory/new", {
        sectionLabel: "Inventory",
        sectionHref: "/inventory",
      }).at(-1)?.label,
      "New item",
    );
    assert.equal(
      shellCrumbs("/events/new", {
        sectionLabel: "Events",
        sectionHref: "/events",
      }).at(-1)?.label,
      "New event",
    );
  });
});
