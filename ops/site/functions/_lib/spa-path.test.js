import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizePath,
  editorKey,
  editorClosePath,
  editorReturnTo,
  inventoryItemPath,
  isClientNavPath,
  isEditorPath,
  isSpaDocumentPath,
  menuItemPath,
  menuNewPath,
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
    assert.equal(menuTabPath("/menu/negroni/recipe", "analysis"), "/menu/negroni/analysis");
    assert.equal(inventoryItemPath("Bombay Sapphire"), "/inventory/bombay-sapphire");
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
    assert.equal(isSpaDocumentPath("/web"), true);
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
    assert.equal(shellPageKey("/web"), "web");
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
  });
});
