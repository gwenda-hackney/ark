import { isEditorPath, parseShellPath } from "./spa-path.js";
import type { NavRoute } from "./shell/types";
import { NAV_ROUTES } from "./nav-routes.ts";
import { flattenNavRoutes, matchActiveRoute } from "./nav-tree.ts";

/**
 * Phone navigation, built from the side rail so the two never drift apart.
 * The bottom bar picks a group and goes straight to a page in it. The pages
 * of the current group sit in a tab strip along the top (SectionTabs).
 * More is a page of its own: settings, environment and account.
 */
export type MobileTabId = "home" | "service" | "programme" | "website" | "more";

export type MobileTab = {
	id: MobileTabId;
	label: string;
	icon: string;
	/** Shows the "waiting for the website" count. */
	badge?: "website";
};

/** Pages in a strip, split where the rail splits them (Menu | Stock | Lightspeed). */
export type PageGroup = { id: string; pages: NavRoute[] };

/** Rail sections that are a bottom tab of their own. */
const SECTION_TABS: string[] = ["service", "programme"];
/** Rail leaves lifted out of their section into the Website tab. */
const WEBSITE_LEAVES = ["web", "dev-tools"];
/** Tabs with a top strip. Home and More are single pages. */
const STRIP_TABS: MobileTabId[] = ["service", "programme", "website"];

export const LAST_PAGE_KEY = "ops.mobile.last";
export const MORE_PATH = "/more";

function flattenAll(routes: NavRoute[]): NavRoute[] {
	return routes.flatMap((row) => [row, ...flattenAll(row.children || [])]);
}

function routeName(routes: NavRoute[], id: string, fallback: string): string {
	return flattenAll(routes).find((row) => row.id === id)?.name || fallback;
}

export function mobileTabs(routes: NavRoute[] = NAV_ROUTES): MobileTab[] {
	return [
		{ id: "home", label: "Home", icon: "home" },
		{ id: "service", label: routeName(routes, "service", "Service"), icon: "menu" },
		{ id: "programme", label: routeName(routes, "programme", "Programme"), icon: "events" },
		{ id: "website", label: routeName(routes, "web", "Website"), icon: "web", badge: "website" },
		{ id: "more", label: "More", icon: "more" },
	];
}

/** Leaves of one rail section, grouped by sub-group, without the website pages. */
function sectionGroups(routes: NavRoute[], sectionId: string): PageGroup[] {
	const section = routes.find((row) => row.id === sectionId);
	if (!section?.children?.length) return [];
	const out: PageGroup[] = [];
	let loose: NavRoute[] = [];
	const flush = () => {
		if (loose.length) out.push({ id: `${sectionId}-${out.length}`, pages: loose });
		loose = [];
	};
	for (const child of section.children) {
		if (WEBSITE_LEAVES.includes(child.id)) continue;
		if (child.children?.length) {
			flush();
			const pages = flattenNavRoutes([child]).filter((row) => !WEBSITE_LEAVES.includes(row.id));
			if (pages.length) out.push({ id: child.id, pages });
		} else if (child.path) {
			loose.push(child);
		}
	}
	flush();
	return out;
}

/**
 * Pages behind a bottom tab, in rail order. Service and Programme are their
 * rail sections; Website is the website page plus Developer tools; More is
 * the Settings section (Developer tools stays there too, for admins).
 * Pass routes already filtered with `visibleRoutes` so admin pages drop out.
 */
export function groupPages(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): PageGroup[] {
	if (id === "service" || id === "programme") return sectionGroups(routes, id);
	if (id === "website") {
		const leaves = flattenNavRoutes(routes);
		const pages = WEBSITE_LEAVES.map((leafId) => leaves.find((row) => row.id === leafId)).filter(
			(row): row is NavRoute => Boolean(row),
		);
		return pages.length ? [{ id: "website", pages }] : [];
	}
	if (id === "more") {
		const settings = routes.find((row) => row.id === "settings");
		const pages = settings ? flattenNavRoutes([settings]) : [];
		return pages.length ? [{ id: "settings", pages }] : [];
	}
	return [];
}

/** Tab strip groups for a bottom tab. Empty when there is nothing to switch between. */
export function stripGroups(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): PageGroup[] {
	if (!STRIP_TABS.includes(id)) return [];
	const groups = groupPages(id, routes);
	const count = groups.reduce((sum, row) => sum + row.pages.length, 0);
	return count > 1 ? groups : [];
}

function pagesOf(id: MobileTabId, routes: NavRoute[]): NavRoute[] {
	return groupPages(id, routes).flatMap((row) => row.pages);
}

/** First page of a tab: where the bar goes with nothing remembered. */
export function firstPage(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): string {
	if (id === "home") return "/";
	if (id === "more") return MORE_PATH;
	return pagesOf(id, routes)[0]?.path || "/";
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
	if (remembered && pagesOf(id, routes).some((row) => row.path === remembered)) return remembered;
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
	if (WEBSITE_LEAVES.includes(leaf.id)) return "website";
	const section = routes.find((row) => flattenNavRoutes([row]).some((child) => child.id === leaf.id));
	if (section?.id === "settings") return "more";
	if (section && SECTION_TABS.includes(section.id)) return section.id as MobileTabId;
	return "more";
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
