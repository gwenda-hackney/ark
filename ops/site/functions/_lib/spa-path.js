/**
 * Ops shell URLs. Path-based (`/menu/negroni`), with a mapping from the old
 * hash routes (`/#/menu`) so bookmarks still land in the right place.
 */

import { itemSlug } from "./item-key.js";

export { itemMatchesKey, itemSlug, namesClash } from "./item-key.js";

export function stripTrailingSlash(pathname) {
  if (!pathname || pathname === "/") return "/";
  return String(pathname).replace(/\/+$/, "") || "/";
}

/**
 * HTML document routes served by the Svelte shell (not static tool folders).
 * `/stock`, `/breakeven`, `/cashflow` are real directories, so they are not
 * rewritten to index.html.
 */
export function isSpaDocumentPath(pathname) {
  const p = stripTrailingSlash(pathname);
  return (
    p === "/menu" ||
    p.startsWith("/menu/") ||
    p === "/inventory" ||
    p.startsWith("/inventory/") ||
    p === "/lightspeed" ||
    p.startsWith("/lightspeed/") ||
    p === "/suppliers" ||
    p.startsWith("/suppliers/") ||
    p === "/config" ||
    p.startsWith("/config/") ||
    p === "/sections" ||
    p.startsWith("/sections/") ||
    p === "/users" ||
    p.startsWith("/users/") ||
    p === "/events" ||
    p.startsWith("/events/") ||
    p === "/artists" ||
    p.startsWith("/artists/") ||
    p === "/web" ||
    p.startsWith("/web/") ||
    p === "/forms" ||
    p.startsWith("/forms/") ||
    p === "/tools" ||
    p.startsWith("/tools/")
  );
}

/** Client-side nav targets (history API). Static tool folders stay full-page. */
export function isClientNavPath(pathname) {
  const p = stripTrailingSlash(pathname);
  if (p === "/") return true;
  return isSpaDocumentPath(p);
}

/**
 * Turn a Location-like string into a shell path.
 * `/#/menu` → `/menu`, `/menu/#/menu` → `/menu`, `/menu/negroni` → `/menu/negroni`.
 */
export function canonicalizePath(href) {
  if (!href || typeof href !== "string") return "/";
  let raw = href.trim();
  if (raw.startsWith("/#")) {
    raw = raw.slice(2) || "/";
    if (!raw.startsWith("/")) raw = `/${raw}`;
  }
  const hashIdx = raw.indexOf("#");
  if (hashIdx >= 0) raw = raw.slice(0, hashIdx) || "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";

  const qIdx = raw.indexOf("?");
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const search = qIdx >= 0 ? raw.slice(qIdx) : "";
  let path = stripTrailingSlash(pathPart);
  if (path === "/events/nights" || path.startsWith("/events/nights/")) {
    path = `/events/schedule${path.slice("/events/nights".length)}`;
  }
  return path + search;
}

/** Drink editor tabs. `details` is the default (Build) and is omitted from the URL. */
export const MENU_DETAIL_TABS = ["details", "menu", "cost", "analysis"];
const MENU_TAB_IDS = new Set(MENU_DETAIL_TABS);
/** Event editor tabs. `details` is the default and is omitted from the URL. */
/** Publishing moved to Website > Staging → live; old /publish links land on details. */
export const EVENT_DETAIL_TABS = ["details", "schedule", "gallery"];
const EVENT_TAB_IDS = new Set(EVENT_DETAIL_TABS);
/** Older drink tabs still resolve. */
const MENU_TAB_ALIASES = new Map([
  ["pos", "menu"],
  ["recipe", "details"],
]);

/** Spec book type filters (`/menu/print`, `/menu/print/beer`). */
export const MENU_PRINT_FILTERS = [
  "all",
  "cocktail",
  "pour",
  "beer",
  "packaged",
  "postmix",
];
const MENU_PRINT_FILTER_IDS = new Set(MENU_PRINT_FILTERS);

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizeMenuTab(tab) {
  const raw = String(tab || "").trim();
  const aliased = MENU_TAB_ALIASES.get(raw) || raw;
  return MENU_TAB_IDS.has(aliased) ? aliased : "details";
}

export function normalizePrintFilter(filter) {
  const raw = String(filter || "").trim().toLowerCase();
  return MENU_PRINT_FILTER_IDS.has(raw) ? raw : "cocktail";
}

function withMenuTab(base, tab) {
  const id = normalizeMenuTab(tab);
  return id === "details" ? base : `${base}/${id}`;
}

export function normalizeEventTab(tab) {
  const raw = String(tab || "").trim();
  return EVENT_TAB_IDS.has(raw) ? raw : "details";
}

function withEventTab(base, tab) {
  const id = normalizeEventTab(tab);
  return id === "details" ? base : `${base}/${id}`;
}

export function parseShellPath(path) {
  const p = stripTrailingSlash((path || "/").split("?")[0] || "/");
  if (p === "/" || p === "") return { page: "home" };
  if (p === "/menu") return { page: "menu", slug: null, isNew: false, tab: null };
  if (p.startsWith("/menu/")) {
    const parts = p
      .slice("/menu/".length)
      .split("/")
      .filter(Boolean)
      .map(decodeSegment);
    if (parts[0] === "print") {
      return {
        page: "menu",
        slug: null,
        isNew: false,
        tab: null,
        print: true,
        printFilter: normalizePrintFilter(parts[1]),
      };
    }
    if (parts[0] === "new") {
      const tab = normalizeMenuTab(parts[1]);
      return { page: "menu", slug: null, isNew: true, tab };
    }
    if (parts[1] === "print") {
      return {
        page: "menu",
        slug: parts[0] || null,
        isNew: false,
        tab: null,
        print: true,
        printFilter: "all",
      };
    }
    const tab = normalizeMenuTab(parts[1]);
    return {
      page: "menu",
      slug: parts[0] || null,
      isNew: false,
      tab,
    };
  }
  if (p === "/inventory") {
    return { page: "inventory", slug: null, isNew: false };
  }
  if (p === "/inventory/new") {
    return { page: "inventory", slug: null, isNew: true };
  }
  if (p.startsWith("/inventory/")) {
    return {
      page: "inventory",
      slug: decodeURIComponent(p.slice("/inventory/".length)),
      isNew: false,
    };
  }
  if (p === "/lightspeed" || p.startsWith("/lightspeed/")) {
    const rest = p === "/lightspeed" ? "" : p.slice("/lightspeed/".length);
    return {
      page: "lightspeed",
      view: rest === "export" ? "export" : rest === "menus" ? "menus" : "reconcile",
    };
  }
  if (p === "/suppliers" || p.startsWith("/suppliers/")) {
    return { page: "suppliers" };
  }
  if (p === "/users" || p.startsWith("/users/")) return { page: "users" };
  if (p === "/events" || p === "/events/nights" || p === "/events/schedule") {
    return {
      page: "events",
      slug: null,
      isNew: false,
      tab: null,
      list: p === "/events" ? "series" : "schedule",
    };
  }
  if (p.startsWith("/events/")) {
    const parts = p
      .slice("/events/".length)
      .split("/")
      .filter(Boolean)
      .map(decodeSegment);
    if (parts[0] === "new") {
      if (parts[1] === "once") {
        return {
          page: "events",
          slug: null,
          isNew: true,
          tab: normalizeEventTab(parts[2]),
          list: null,
          kind: "once",
        };
      }
      return {
        page: "events",
        slug: null,
        isNew: true,
        tab: normalizeEventTab(parts[1]),
        list: null,
      };
    }
    if (parts[0] === "nights" || parts[0] === "schedule") {
      return {
        page: "events",
        slug: null,
        isNew: false,
        tab: null,
        list: "schedule",
      };
    }
    return {
      page: "events",
      slug: parts[0] || null,
      isNew: false,
      tab: normalizeEventTab(parts[1]),
      list: null,
    };
  }
  if (p === "/artists") {
    return { page: "artists", slug: null, isNew: false };
  }
  if (p.startsWith("/artists/")) {
    const part = decodeSegment(p.slice("/artists/".length).split("/")[0] || "");
    if (part === "new") {
      return { page: "artists", slug: null, isNew: true };
    }
    return { page: "artists", slug: part || null, isNew: false };
  }
  if (p === "/web/dev") return { page: "web", view: "dev" };
  // Old link to the release page: the Website page covers it now.
  if (p === "/web/release") return { page: "web", view: null };
  if (p === "/web" || p.startsWith("/web/")) return { page: "web", view: null };
  if (p === "/forms") return { page: "forms", slug: null };
  if (p.startsWith("/forms/")) {
    const part = decodeSegment(p.slice("/forms/".length).split("/")[0] || "");
    return { page: "forms", slug: part || null };
  }
  if (p === "/config" || p.startsWith("/config/")) return { page: "config" };
  if (p === "/sections" || p.startsWith("/sections/")) return { page: "sections" };
  if (p === "/tools" || p.startsWith("/tools/")) {
    const rest = p === "/tools" ? "" : p.slice("/tools/".length);
    const tool = rest.split("/").filter(Boolean)[0] || "breakeven";
    const allowed = new Set(["breakeven", "cashflow", "stock"]);
    return { page: "tools", tool: allowed.has(tool) ? tool : "breakeven" };
  }
  return { page: "home" };
}

export function menuListPath() {
  return "/menu";
}

/** Spec book. Default filter (`cocktail`) is omitted from the URL. */
export function menuPrintPath(filter) {
  const id = normalizePrintFilter(filter);
  return id === "cocktail" ? "/menu/print" : `/menu/print/${id}`;
}

/** Single-drink spec sheet (`/menu/negroni/print`). */
export function menuItemPrintPath(name) {
  const slug = itemSlug(name);
  if (!slug) return menuPrintPath();
  return `/menu/${encodeURIComponent(slug)}/print`;
}

export function menuNewPath(tab) {
  return withMenuTab("/menu/new", tab);
}

export function menuItemPath(name, tab) {
  const slug = itemSlug(name);
  if (!slug) return menuListPath();
  return withMenuTab(`/menu/${encodeURIComponent(slug)}`, tab);
}

/** Drink URL plus tab (`/menu/negroni/cost`). Unknown tabs fold to details. */
export function menuTabPath(basePath, tab) {
  const parsed = parseShellPath(basePath);
  if (parsed.page !== "menu") return menuListPath();
  if (parsed.isNew) return menuNewPath(tab);
  if (!parsed.slug) return menuListPath();
  return menuItemPath(parsed.slug, tab);
}

/** Series index (`/events`) or schedule calendar (`/events/schedule`). */
export function eventListPath(view = "series") {
  return view === "nights" || view === "schedule"
    ? "/events/schedule"
    : "/events";
}

export function eventNewPath(tab, options = {}) {
  const once = options === true || Boolean(options?.once);
  return withEventTab(once ? "/events/new/once" : "/events/new", tab);
}

export function eventItemPath(id, tab) {
  const slug = String(id || "").trim();
  if (!slug) return eventListPath();
  // Keep @ literal so a night URL stays `/events/12@2026-09-25` and the rail
  // can tell it from the series editor.
  const encoded = slug
    .split("@")
    .map((part) => encodeURIComponent(part))
    .join("@");
  return withEventTab(`/events/${encoded}`, tab);
}

/** Event URL plus tab (`/events/12/schedule`). Unknown tabs fold to details. */
export function eventTabPath(basePath, tab) {
  const parsed = parseShellPath(basePath);
  if (parsed.page !== "events") return eventListPath();
  if (parsed.isNew) return eventNewPath(tab, { once: parsed.kind === "once" });
  if (!parsed.slug) return eventListPath();
  return eventItemPath(parsed.slug, tab);
}

export function inventoryListPath() {
  return "/inventory";
}

export function inventoryNewPath() {
  return "/inventory/new";
}

export function inventoryItemPath(name) {
  const slug = itemSlug(name);
  if (!slug) return inventoryListPath();
  return `/inventory/${encodeURIComponent(slug)}`;
}

export function shellPageKey(path) {
  return parseShellPath(path).page;
}

/**
 * Identity for unsaved-edit guards. Tabs on the same drink share a key.
 * List pages are bare `menu` / `inventory`.
 */
export function editorKey(path) {
  const route = parseShellPath(path);
  if (route.page === "menu") {
    if (route.isNew) return "menu:new";
    if (route.slug) return `menu:${route.slug}`;
    return "menu";
  }
  if (route.page === "inventory") {
    if (route.isNew) return "inventory:new";
    if (route.slug) return `inventory:${route.slug}`;
    return "inventory";
  }
  if (route.page === "events") {
    if (route.isNew) return "events:new";
    if (route.slug) return `events:${route.slug}`;
    return "events";
  }
  if (route.page === "artists") {
    if (route.isNew) return "artists:new";
    if (route.slug) return `artists:${route.slug}`;
    return "artists";
  }
  return route.page || "home";
}

export function navigationLeavesEditor(fromPath, toPath) {
  const from = editorKey(fromPath);
  const to = editorKey(toPath);
  if (from === to) return false;
  if (
    from === "menu" ||
    from === "inventory" ||
    from === "lightspeed" ||
    from === "suppliers" ||
    from === "home" ||
    from === "stock" ||
    from === "breakeven" ||
    from === "cashflow" ||
    from === "config" ||
    from === "sections" ||
    from === "users" ||
    from === "events" ||
    from === "artists" ||
    from === "web" ||
    from === "forms"
  ) {
    return false;
  }
  return true;
}

function pathOnly(path) {
  return stripTrailingSlash(String(path || "/").split("?")[0] || "/") || "/";
}

/** Recipe, inventory, and event detail (including `/menu/new`). Lists and print book are not. */
export function isEditorPath(path) {
  const route = parseShellPath(path);
  if (route.print) return false;
  return (
    (route.page === "menu" ||
      route.page === "inventory" ||
      route.page === "events" ||
      route.page === "artists") &&
    Boolean(route.isNew || route.slug)
  );
}

function sanitizeReturnTo(value) {
  if (typeof value !== "string" || !value) return undefined;
  const path = pathOnly(canonicalizePath(value));
  if (!isClientNavPath(path)) return undefined;
  return path;
}

/**
 * Remember the page that opened an editor. Tab switches and save
 * canonicalization keep that origin; jumping to another record on the
 * same list does too. Opening a different section's editor starts a new origin.
 */
export function editorReturnTo(fromPath, toPath, previousReturnTo) {
  const from = pathOnly(fromPath);
  const to = pathOnly(toPath);
  if (!isEditorPath(to)) return undefined;
  if (!isEditorPath(from)) return from;
  if (editorKey(from) === editorKey(to)) {
    return sanitizeReturnTo(previousReturnTo);
  }
  if (parseShellPath(from).page === parseShellPath(to).page) {
    return sanitizeReturnTo(previousReturnTo) || from;
  }
  return from;
}

/** Tab changes stay on the same history entry so Close / Back leave the editor. */
export function shouldReplaceNav(fromPath, toPath) {
  if (!isEditorPath(fromPath)) return false;
  return editorKey(fromPath) === editorKey(toPath);
}

/**
 * Close lands on the opener (dashboard, list, another page). Direct loads
 * with no opener fall back to the section list.
 */
export function editorClosePath(currentPath, historyReturnTo, fallback) {
  const current = pathOnly(currentPath);
  const origin = sanitizeReturnTo(historyReturnTo);
  if (origin && origin !== current && editorKey(origin) !== editorKey(current)) {
    return origin;
  }
  return pathOnly(fallback || "/");
}

/**
 * Ancestor crumbs are links; the last entry is the current page.
 * `leaf` is the recipe / inventory title when a detail is open.
 */
export function shellCrumbs(
  path,
  {
    homeLabel = "Operations",
    sectionLabel = "",
    sectionHref = "",
    leaf = "",
  } = {},
) {
  const route = parseShellPath(path);
  const nested = Boolean(route.isNew || route.slug || route.print);
  const crumbs = [{ label: homeLabel, href: "/" }];
  if (route.page !== "home" && sectionLabel) {
    const crumb = { label: sectionLabel };
    if (nested && sectionHref) crumb.href = sectionHref;
    crumbs.push(crumb);
  } else if (route.page === "home" && sectionLabel && sectionLabel !== homeLabel) {
    crumbs.push({ label: sectionLabel });
  }
  const leafLabel =
    (typeof leaf === "string" && leaf.trim()) ||
    (route.isNew
      ? route.page === "events"
        ? "New event"
        : route.page === "artists"
          ? "New artist"
          : "New item"
      : "");
  if (leafLabel && nested) crumbs.push({ label: leafLabel });
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}
