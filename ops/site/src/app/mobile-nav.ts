import { isEditorPath, parseShellPath } from "./spa-path.js";
import type { NavRoute } from "./shell/types";
import { NAV_ROUTES } from "./nav-routes.ts";
import { flattenNavRoutes, matchActiveRoute } from "./nav-tree.ts";

/**
 * Phone navigation, built from the side rail so the two never drift apart.
 * Each bottom tab is one rail heading (#312): What's on, Bar & kitchen, and
 * Publish as Website; Settings sits on More, a page of its own with the
 * environment and account. The bar goes straight to a page in its heading,
 * and the heading's pages sit in a strip along the top (SectionTabs).
 */
export type MobileTabId = "home" | "whats-on" | "bar-kitchen" | "website" | "more";

export type MobileTab = {
	id: MobileTabId;
	label: string;
	icon: string;
	/** Shows the "waiting for the website" count. */
	badge?: "website";
};

/** The rail heading behind each bottom tab. Home is the dashboard alone. */
const TAB_HEADINGS: Partial<Record<MobileTabId, string>> = {
	"whats-on": "whats-on",
	"bar-kitchen": "bar-kitchen",
	website: "publish",
	more: "settings",
};
/** Tabs with a top strip. Home and More are single pages. */
const STRIP_TABS: MobileTabId[] = ["whats-on", "bar-kitchen", "website"];

export const LAST_PAGE_KEY = "ops.mobile.last";
export const MORE_PATH = "/more";

function flattenAll(routes: NavRoute[]): NavRoute[] {
	return routes.flatMap((row) => [row, ...flattenAll(row.children || [])]);
}

function routeName(routes: NavRoute[], id: string, fallback: string): string {
	return flattenAll(routes).find((row) => row.id === id)?.name || fallback;
}

/** Home · What's on · Bar & kitchen · Website · More. */
export function mobileTabs(routes: NavRoute[] = NAV_ROUTES): MobileTab[] {
	return [
		{ id: "home", label: "Home", icon: "home" },
		{ id: "whats-on", label: routeName(routes, "whats-on", "What's on"), icon: "events" },
		{ id: "bar-kitchen", label: routeName(routes, "bar-kitchen", "Bar & kitchen"), icon: "menu" },
		{ id: "website", label: routeName(routes, "web", "Website"), icon: "web", badge: "website" },
		{ id: "more", label: "More", icon: "more" },
	];
}

/**
 * Pages behind a bottom tab, in rail order: its heading's pages.
 * Pass routes already filtered with `visibleRoutes` so admin pages drop out.
 */
export function tabPages(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): NavRoute[] {
	const heading = routes.find((row) => row.id === TAB_HEADINGS[id]);
	return heading ? flattenNavRoutes([heading]) : [];
}

/** The top strip's pages for a bottom tab. Empty when there is nothing to switch between. */
export function stripPages(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): NavRoute[] {
	if (!STRIP_TABS.includes(id)) return [];
	const pages = tabPages(id, routes);
	return pages.length > 1 ? pages : [];
}

/** First page of a tab: where the bar goes with nothing remembered. */
export function firstPage(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): string {
	if (id === "home") return "/";
	if (id === "more") return MORE_PATH;
	return tabPages(id, routes)[0]?.path || "/";
}

export type LastPages = Partial<Record<MobileTabId, string>>;

/** Last page used in each tab, from localStorage. Empty when storage is blocked. */
export function readLastPages(storage: Pick<Storage, "getItem"> | null = safeStorage()): LastPages {
	try {
		const raw = storage?.getItem(LAST_PAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as LastPages) : {};
	} catch {
		return {};
	}
}

/** Remember the rail page behind `path` as the last one used in its tab. */
export function rememberPage(
	path: string,
	routes: NavRoute[] = NAV_ROUTES,
	storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage(),
): void {
	const leaf = matchActiveRoute(routes, path);
	if (!leaf?.path) return;
	const tab = mobileTabFor(path, routes);
	if (!STRIP_TABS.includes(tab)) return;
	const last = readLastPages(storage);
	if (last[tab] === leaf.path) return;
	try {
		storage?.setItem(LAST_PAGE_KEY, JSON.stringify({ ...last, [tab]: leaf.path }));
	} catch {
		/* private mode or full: the bar falls back to the first page */
	}
}

/** Last page used in a tab, if it is still one of its pages, else the first page. */
export function lastPage(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES, last: LastPages = readLastPages()): string {
	const remembered = last[id];
	if (remembered && tabPages(id, routes).some((row) => row.path === remembered)) return remembered;
	return firstPage(id, routes);
}

function safeStorage(): Storage | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}

export function mobileTabFor(path: string, routes: NavRoute[] = NAV_ROUTES): MobileTabId {
	if (parseShellPath(path).page === "more") return "more";
	const leaf = matchActiveRoute(routes, path);
	if (!leaf || leaf.id === "home") return "home";
	const heading = routes.find((row) => flattenNavRoutes([row]).some((child) => child.id === leaf.id));
	const tab = (Object.keys(TAB_HEADINGS) as MobileTabId[]).find((id) => TAB_HEADINGS[id] === heading?.id);
	return tab || "more";
}

/** Settings pages opened from More get a back link to it on phones. */
export function backToMore(path: string, routes: NavRoute[] = NAV_ROUTES): boolean {
	if (mobileTabFor(path, routes) !== "more") return false;
	return parseShellPath(path).page !== "more";
}

export function hideShellChrome(path: string): boolean {
	const route = parseShellPath(path);
	return Boolean(route.print) || isEditorPath(path);
}
