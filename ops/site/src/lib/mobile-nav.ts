import { isEditorPath, parseShellPath } from "../app/spa-path.js";
import type { NavRoute } from "../shell/types";
import { NAV_ROUTES } from "./nav-routes.ts";
import { flattenNavRoutes, matchActiveRoute } from "./nav-tree.ts";

/**
 * Phone tab bar, built from the side rail so the two never drift apart.
 * Home goes straight to its page. Service and Programme open a sheet listing
 * that rail section. More lists the website tools and every other section.
 */
export type MobileTabId = "home" | "service" | "programme" | "more";

export type MobileTab = {
	id: MobileTabId;
	label: string;
	icon: string;
	/** Set on tabs that are a page. Tabs without a path open a sheet. */
	path?: string;
};

/** Rail leaves with a tab of their own, left out of every sheet. */
const PAGE_TABS: MobileTabId[] = ["home"];
/** Rail leaves lifted out of their section to the top of More, to keep the bar to four tabs. */
const MORE_LEAVES = ["web"];
/** Rail sections with a tab of their own. */
const SECTION_TABS: MobileTabId[] = ["service", "programme"];

function routeName(routes: NavRoute[], id: string, fallback: string): string {
	return flattenAll(routes).find((row) => row.id === id)?.name || fallback;
}

function flattenAll(routes: NavRoute[]): NavRoute[] {
	return routes.flatMap((row) => [row, ...flattenAll(row.children || [])]);
}

export function mobileTabs(routes: NavRoute[] = NAV_ROUTES): MobileTab[] {
	return [
		{ id: "home", label: "Home", icon: "home", path: "/" },
		{ id: "service", label: routeName(routes, "service", "Service"), icon: "menu" },
		{ id: "programme", label: routeName(routes, "programme", "Programme"), icon: "events" },
		{ id: "more", label: "More", icon: "more" },
	];
}

function withoutLeaves(routes: NavRoute[], ids: string[]): NavRoute[] {
	const out: NavRoute[] = [];
	for (const row of routes) {
		if (ids.includes(row.id)) continue;
		if (row.children?.length) {
			const children = withoutLeaves(row.children, ids);
			if (children.length) out.push({ ...row, children });
		} else {
			out.push(row);
		}
	}
	return out;
}

/** Rail sections listed in a tab's sheet. Empty for tabs that are a page. */
export function sheetSections(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): NavRoute[] {
	const rest = withoutLeaves(routes, [...PAGE_TABS, ...MORE_LEAVES]);
	if ((SECTION_TABS as string[]).includes(id)) return rest.filter((row) => row.id === id);
	if (id !== "more") return [];
	const lifted = flattenAll(routes)
		.filter((row) => MORE_LEAVES.includes(row.id))
		.map((row) => ({ id: `${row.id}-section`, name: row.name, icon: "", heading: true, children: [row] }));
	return [...lifted, ...rest.filter((row) => !(SECTION_TABS as string[]).includes(row.id))];
}

/** First page in a tab, for its plain link. */
export function tabHref(id: MobileTabId, routes: NavRoute[] = NAV_ROUTES): string {
	const tab = mobileTabs(routes).find((row) => row.id === id);
	if (tab?.path) return tab.path;
	return flattenNavRoutes(sheetSections(id, routes))[0]?.path || "/";
}

export function mobileTabFor(path: string, routes: NavRoute[] = NAV_ROUTES): MobileTabId {
	const leaf = matchActiveRoute(routes, path);
	if (!leaf) return "more";
	if ((PAGE_TABS as string[]).includes(leaf.id)) return leaf.id as MobileTabId;
	if (MORE_LEAVES.includes(leaf.id)) return "more";
	const section = routes.find((row) =>
		flattenNavRoutes([row]).some((child) => child.id === leaf.id),
	);
	if (section && (SECTION_TABS as string[]).includes(section.id)) {
		return section.id as MobileTabId;
	}
	return "more";
}

export function hideShellChrome(path: string): boolean {
	const route = parseShellPath(path);
	return Boolean(route.print) || isEditorPath(path);
}
