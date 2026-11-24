import type { NavRoute } from "./shell/types";
import type { SegmentedItem } from "../ui/types";
import { parseShellPath } from "./spa-path.js";

/** Pages only: headings are not destinations. */
export function flattenNavRoutes(routes: NavRoute[]): NavRoute[] {
	const leaves: NavRoute[] = [];
	for (const route of routes) {
		if (route.children?.length) {
			leaves.push(...flattenNavRoutes(route.children));
		} else if (route.path) {
			leaves.push(route);
		}
	}
	return leaves;
}

/**
 * Drop admin-only entries, and pages of an area `see` says they have no
 * access to (#375), with headings left empty, for everyone else.
 */
export function visibleRoutes(
	routes: NavRoute[],
	isAdmin: boolean,
	see: (area: string | undefined) => boolean = () => true,
): NavRoute[] {
	const out: NavRoute[] = [];
	for (const route of routes) {
		if (route.adminOnly && !isAdmin) continue;
		if (route.area && !see(route.area)) continue;
		if (route.children?.length) {
			const children = visibleRoutes(route.children, isAdmin, see);
			if (children.length) out.push({ ...route, children });
		} else {
			out.push(route);
		}
	}
	return out;
}

/** The area of ops a path is in (#375): its tab's, if that tab has its own, else its page's. */
export function areaOfPath(page: NavRoute | null, path: string): string | undefined {
	const bare = path.split("?")[0] || "/";
	const tab = (page?.tabs || [])
		.filter((candidate) => candidate.path === bare || bare.startsWith(`${candidate.path}/`))
		.sort((a, b) => b.path.length - a.path.length)[0];
	return tab?.area || page?.area;
}

/** Every address that is this page: its path, and each of its tabs'. */
export function pagePaths(route: NavRoute): string[] {
	const paths = [route.path, ...(route.tabs || []).map((tab) => tab.path)].filter(
		(path): path is string => Boolean(path),
	);
	return [...new Set(paths)];
}

/** The page itself (or one of its tabs), not a record opened in it. */
export function isPagePath(route: NavRoute | null, path: string): boolean {
	const bare = path.split("?")[0] || "/";
	return Boolean(route && pagePaths(route).includes(bare));
}

/** A page's tabs as links for its header (Stock: Inventory | Suppliers); one of an area `see` refuses is disabled. */
export function pageTabs(
	routes: NavRoute[],
	id: string,
	see: (area: string | undefined) => boolean = () => true,
): SegmentedItem[] {
	const page = flattenNavRoutes(routes).find((route) => route.id === id);
	return (page?.tabs || []).map((tab) => ({
		id: tab.id,
		label: tab.label,
		href: tab.path,
		...(tab.badge ? { badge: tab.badge } : {}),
		...(tab.area && !see(tab.area) ? { disabled: true, reason: "You don't have access to this. Ask an owner." } : {}),
	}));
}

function decodeNavPath(path: string): string {
	const bare = path.split("?")[0] ?? "/";
	try {
		return decodeURIComponent(bare);
	} catch {
		return bare;
	}
}

/** Schedule list, its Add (any kind), or a dated night editor. */
export function isEventsScheduleNavPath(path: string): boolean {
	const p = decodeNavPath(path);
	return (
		p === "/events/schedule" ||
		p.startsWith("/events/schedule/") ||
		p === "/events/nights" ||
		p.startsWith("/events/nights/") ||
		p === "/events/new/once" ||
		p.startsWith("/events/new/once/") ||
		/^\/events\/[^/]+@/.test(p)
	);
}

/** Longest matching page for the current path, by its own path or a tab's. */
export function matchActiveRoute(
	routes: NavRoute[],
	path: string,
): NavRoute | null {
	const withoutQuery = path.split("?")[0] ?? "/";
	const leaves = flattenNavRoutes(routes);
	if (isEventsScheduleNavPath(withoutQuery)) {
		return leaves.find((n) => n.id === "schedule") ?? null;
	}
	const exact = leaves.find((n) => pagePaths(n).includes(withoutQuery));
	if (exact) return exact;
	const ranked = leaves
		.flatMap((leaf) => pagePaths(leaf).map((href) => ({ leaf, href })))
		.filter(
			({ href }) => href !== "/" && (withoutQuery === href || withoutQuery.startsWith(`${href}/`)),
		)
		.sort((a, b) => b.href.length - a.href.length);
	if (ranked[0]) return ranked[0].leaf;
	if (withoutQuery === "/" || withoutQuery === "") {
		return leaves.find((n) => n.path === "/") ?? null;
	}
	return null;
}

/**
 * The frame the app shows a path in: a page with tabs is one frame (Stock
 * for /inventory and /suppliers), so switching tabs keeps the page and its
 * tabs where they are; any other page is its own.
 */
export function pageFrame(routes: NavRoute[], path: string): string {
	const page = matchActiveRoute(routes, path);
	if (page?.tabs?.length) return page.id;
	return parseShellPath(path).page;
}
