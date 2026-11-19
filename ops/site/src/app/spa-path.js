/**
 * Ops shell URLs. Path-based (`/menu/negroni`), with a mapping from the old
 * hash routes (`/#/menu`) so bookmarks still land in the right place.
 */

import { itemSlug } from "../menu/item-key.js";
import { closedArtistRedirect } from "../artists/featured-artist.js";

export { itemMatchesKey, itemSlug, namesClash } from "../menu/item-key.js";

export function stripTrailingSlash(pathname) {
  if (!pathname || pathname === "/") return "/";
  return String(pathname).replace(/\/+$/, "") || "/";
}

/**
 * HTML document routes served by the Svelte shell.
 * `/stock`, `/breakeven`, `/cashflow` are real directories, so they are not
 * rewritten to index.html.
 */
export function isSpaDocumentPath(pathname) {
  const p = stripTrailingSlash(pathname);
  return (
    p === "/menu" ||
    p.startsWith("/menu/") ||
    p === "/menus" ||
    p.startsWith("/menus/") ||
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
    p === "/venue" ||
    p.startsWith("/venue/") ||
    p === "/events" ||
    p.startsWith("/events/") ||
    p === "/popups" ||
    p.startsWith("/popups/") ||
    p === "/deals" ||
    p.startsWith("/deals/") ||
    p === "/artists" ||
    p.startsWith("/artists/") ||
    p === "/occasions" ||
    p.startsWith("/occasions/") ||
    p === "/web" ||
    p.startsWith("/web/") ||
    p === "/forms" ||
    p.startsWith("/forms/") ||
    p === "/email" ||
    p.startsWith("/email/") ||
    p === "/more"
  );
}

/** Client-side nav targets (history API). */
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
  // No new featured artists while it's closed (#313): back to the list.
  const closedArtist = closedArtistRedirect(path);
  if (closedArtist) return closedArtist;
  return path + search;
}

/**
 * What's on's lists of one kind (#312), each at its own address: Events
 * (nights), Pop-ups and Deals. Each opens the same event editor under its own
 * address (`/popups/36`); a night of any of them is a Schedule thing and stays
 * under `/events` (`/events/36@2026-11-20`).
 */
export const EVENT_SECTIONS = ["events", "popups", "deals"];

function eventSectionBase(section) {
  return EVENT_SECTIONS.includes(section) ? `/${section}` : "/events";
}

/** Drink editor tabs. `details` is the default (Build) and is omitted from the URL. */
export const MENU_DETAIL_TABS = ["details", "menu", "cost", "analysis"];
const MENU_TAB_IDS = new Set(MENU_DETAIL_TABS);
/** Event editor tabs. `details` is the default and is omitted from the URL. */
/** Publishing moved to Website > Preview → live; old /publish links land on details. */
export const EVENT_DETAIL_TABS = [
  "details",
  "menus",
  "schedule",
  "ops",
  "gallery",
];
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
  const raw = String(filter || "")
    .trim()
    .toLowerCase();
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
  if (p === "/menu")
    return { page: "menu", slug: null, isNew: false, tab: null };
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
  // Menus (#305): the list, a new one, or one by its id.
  if (p === "/menus") return { page: "menus", slug: null, isNew: false };
  if (p.startsWith("/menus/")) {
    const part = decodeSegment(p.slice("/menus/".length).split("/")[0] || "");
    if (part === "new") return { page: "menus", slug: null, isNew: true };
    return { page: "menus", slug: part || null, isNew: false };
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
      view:
        rest === "export" ? "export" : rest === "menus" ? "menus" : "reconcile",
    };
  }
  if (p === "/suppliers" || p.startsWith("/suppliers/")) {
    return { page: "suppliers" };
  }
  if (p === "/users" || p.startsWith("/users/")) return { page: "users" };
  // Venue, and (#291) the venue's photos (What's on → Photos)
  if (p === "/venue" || p.startsWith("/venue/")) {
    return {
      page: "venue",
      view: p === "/venue/gallery" ? "gallery" : "details",
    };
  }
  if (p === "/more") return { page: "more" };
  const eventSection = /^\/(events|popups|deals)(?:\/|$)/.exec(p)?.[1];
  if (eventSection) return parseEventPath(p, eventSection);
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
  if (p === "/occasions") return { page: "occasions", slug: null, isNew: false };
  if (p.startsWith("/occasions/")) {
    const part = decodeSegment(p.slice("/occasions/".length).split("/")[0] || "");
    if (part === "new") return { page: "occasions", slug: null, isNew: true };
    return { page: "occasions", slug: part || null, isNew: false };
  }
  if (p === "/web/dev") return { page: "web", view: "dev" };
  if (p === "/web/dev/settings") return { page: "web", view: "settings" };
  // Old link to the release page: the Website page covers it now.
  if (p === "/web/release") return { page: "web", view: null };
  if (p === "/web" || p.startsWith("/web/")) return { page: "web", view: null };
  if (p === "/email/sent") return { page: "email", view: "sent" };
  if (p === "/email/settings") return { page: "email", view: "settings" };
  if (p === "/email" || p.startsWith("/email/"))
    return { page: "email", view: null };
  if (p === "/forms") return { page: "forms", slug: null };
  if (p.startsWith("/forms/")) {
    const part = decodeSegment(p.slice("/forms/".length).split("/")[0] || "");
    return { page: "forms", slug: part || null };
  }
  // Menu sections live on each menu's page now (#305): old links land on Menus.
  if (p === "/config/sections" || p.startsWith("/config/sections/"))
    return { page: "menus", slug: null, isNew: false, moved: true };
  if (p === "/config" || p.startsWith("/config/")) {
    const tab = decodeSegment(p.slice("/config/".length).split("/")[0] || "");
    return { page: "config", tab: tab || null };
  }
  // Sections used to be a page of its own, then a Configuration tab.
  if (p === "/sections" || p.startsWith("/sections/"))
    return { page: "menus", slug: null, isNew: false, moved: true };
  return { page: "home" };
}

/**
 * `/events`, `/popups` or `/deals`: that list (`list` names the list shown),
 * a new one of that kind, or one opened by id. `/events/schedule` is the
 * Schedule; `/events/new/once` is its Add, which asks what kind first.
 */
function parseEventPath(p, section) {
  const base = `/${section}`;
  const at = (fields) => ({
    page: "events",
    section,
    slug: null,
    isNew: false,
    tab: null,
    list: null,
    ...fields,
  });
  if (p === base) return at({ list: section });
  const parts = p
    .slice(base.length + 1)
    .split("/")
    .filter(Boolean)
    .map(decodeSegment);
  if (
    section === "events" &&
    (parts[0] === "nights" || parts[0] === "schedule")
  ) {
    return at({ list: "schedule" });
  }
  if (parts[0] === "new") {
    if (section === "events" && parts[1] === "once") {
      return at({
        isNew: true,
        tab: normalizeEventTab(parts[2]),
        kind: "once",
      });
    }
    return at({ isNew: true, tab: normalizeEventTab(parts[1]) });
  }
  return at({ slug: parts[0] || null, tab: normalizeEventTab(parts[1]) });
}

/** Menu → Menus. */
export function menusListPath() {
  return "/menus";
}

/** A menu's page, by its id. */
export function menuPagePath(id) {
  const key = String(id || "").trim();
  return key ? `/menus/${encodeURIComponent(key)}` : menusListPath();
}

/** A new menu; from a pop-up kitchen (`popupId`), it starts with the pop-up's name, dates and days. */
export function newMenuPath(popupId) {
  const popup = String(popupId || "").trim();
  return popup ? `/menus/new?popup=${encodeURIComponent(popup)}` : "/menus/new";
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

/** A What's on list: the Schedule (`/events/schedule`), or Events, Pop-ups or Deals. */
export function eventListPath(list = "events") {
  return list === "nights" || list === "schedule"
    ? "/events/schedule"
    : eventSectionBase(list);
}

/**
 * Add, from a list: a new one of that list's kind (`/popups/new`), or with
 * `once` the Schedule's Add, which asks what kind first (`/events/new/once`).
 */
export function eventNewPath(tab, options = {}) {
  const once = options === true || Boolean(options?.once);
  const base = once
    ? "/events/new/once"
    : `${eventSectionBase(options?.section)}/new`;
  return withEventTab(base, tab);
}

/** An event at its list's address (`/popups/36`); a night (`36@2026-11-20`) is always under /events. */
export function eventItemPath(id, tab, section) {
  const slug = String(id || "").trim();
  if (!slug) return eventListPath(section);
  // Keep @ literal so a night URL stays `/events/12@2026-09-25` and the rail
  // can tell it from the series editor.
  const encoded = slug
    .split("@")
    .map((part) => encodeURIComponent(part))
    .join("@");
  const base = slug.includes("@") ? "/events" : eventSectionBase(section);
  return withEventTab(`${base}/${encoded}`, tab);
}

/** Event URL plus tab (`/popups/12/schedule`), in the same list. Unknown tabs fold to details. */
export function eventTabPath(basePath, tab) {
  const parsed = parseShellPath(basePath);
  if (parsed.page !== "events") return eventListPath();
  if (parsed.isNew)
    return eventNewPath(tab, {
      once: parsed.kind === "once",
      section: parsed.section,
    });
  if (!parsed.slug) return eventListPath(parsed.section);
  return eventItemPath(parsed.slug, tab, parsed.section);
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
  if (route.page === "occasions") {
    if (route.isNew) return "occasions:new";
    if (route.slug) return `occasions:${route.slug}`;
    return "occasions";
  }
  if (route.page === "menus") {
    if (route.isNew) return "menus:new";
    if (route.slug) return `menus:${route.slug}`;
    return "menus";
  }
  // A play application's guest-artist fields can be left unsaved.
  if (route.page === "forms" && route.slug) return `forms:${route.slug}`;
  return route.page || "home";
}

export function navigationLeavesEditor(fromPath, toPath) {
  const from = editorKey(fromPath);
  const to = editorKey(toPath);
  if (from === to) return false;
  if (
    from === "menu" ||
    from === "menus" ||
    from === "inventory" ||
    from === "lightspeed" ||
    from === "suppliers" ||
    from === "home" ||
    from === "stock" ||
    from === "breakeven" ||
    from === "cashflow" ||
    from === "users" ||
    from === "venue" ||
    from === "more" ||
    from === "events" ||
    from === "artists" ||
    from === "occasions" ||
    from === "web" ||
    from === "email" ||
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
      route.page === "menus" ||
      route.page === "inventory" ||
      route.page === "events" ||
      route.page === "artists" ||
      route.page === "occasions") &&
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
  if (
    origin &&
    origin !== current &&
    editorKey(origin) !== editorKey(current)
  ) {
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
  } else if (
    route.page === "home" &&
    sectionLabel &&
    sectionLabel !== homeLabel
  ) {
    crumbs.push({ label: sectionLabel });
  }
  const leafLabel =
    (typeof leaf === "string" && leaf.trim()) ||
    (route.isNew
      ? route.page === "events"
        ? "New event"
        : route.page === "artists"
          ? "New artist"
          : route.page === "occasions"
            ? "New occasion"
            : route.page === "menus"
              ? "New menu"
              : "New item"
      : "");
  if (leafLabel && nested) crumbs.push({ label: leafLabel });
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}
