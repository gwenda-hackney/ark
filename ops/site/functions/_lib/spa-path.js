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
    p === "/web" ||
    p.startsWith("/web/") ||
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
  const path = stripTrailingSlash(pathPart);
  return path + search;
}

/** Drink editor tabs. `details` is the default and is omitted from the URL. */
export const MENU_DETAIL_TABS = ["details", "recipe", "analysis"];
const MENU_TAB_IDS = new Set(MENU_DETAIL_TABS);

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizeMenuTab(tab) {
  return MENU_TAB_IDS.has(tab) ? tab : "details";
}

function withMenuTab(base, tab) {
  const id = normalizeMenuTab(tab);
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
    const tab = MENU_TAB_IDS.has(parts[1]) ? parts[1] : "details";
    if (parts[0] === "new") {
      return { page: "menu", slug: null, isNew: true, tab };
    }
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
      view: rest === "export" ? "export" : "reconcile",
    };
  }
  if (p === "/suppliers" || p.startsWith("/suppliers/")) {
    return { page: "suppliers" };
  }
  if (p === "/users" || p.startsWith("/users/")) return { page: "users" };
  if (p === "/web" || p.startsWith("/web/")) return { page: "web" };
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

export function menuNewPath(tab) {
  return withMenuTab("/menu/new", tab);
}

export function menuItemPath(name, tab) {
  const slug = itemSlug(name);
  if (!slug) return menuListPath();
  return withMenuTab(`/menu/${encodeURIComponent(slug)}`, tab);
}

/** Drink URL plus tab (`/menu/negroni/recipe`). Unknown tabs fold to details. */
export function menuTabPath(basePath, tab) {
  const parsed = parseShellPath(basePath);
  if (parsed.page !== "menu") return menuListPath();
  if (parsed.isNew) return menuNewPath(tab);
  if (!parsed.slug) return menuListPath();
  return menuItemPath(parsed.slug, tab);
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
    from === "web"
  ) {
    return false;
  }
  return true;
}

function pathOnly(path) {
  return stripTrailingSlash(String(path || "/").split("?")[0] || "/") || "/";
}

/** Recipe / inventory detail (including `/menu/new`). Lists and dashboard are not. */
export function isEditorPath(path) {
  const route = parseShellPath(path);
  return (
    (route.page === "menu" || route.page === "inventory") &&
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
  const nested = Boolean(route.isNew || route.slug);
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
    (route.isNew ? "New item" : "");
  if (leafLabel && nested) crumbs.push({ label: leafLabel });
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}
