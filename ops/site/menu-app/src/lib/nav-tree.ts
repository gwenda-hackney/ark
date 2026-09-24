import type { NavRoute } from "../shell/types";

/** Leaves only. Groups with children are not destinations. */
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

function decodeNavPath(path: string): string {
	const bare = path.split("?")[0] ?? "/";
	try {
		return decodeURIComponent(bare);
	} catch {
		return bare;
	}
}

/** Schedule list, a special event, or a dated night editor. */
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

/** Longest matching leaf for the current path. */
export function matchActiveRoute(
	routes: NavRoute[],
	path: string,
): NavRoute | null {
	const withoutQuery = path.split("?")[0] ?? "/";
	const leaves = flattenNavRoutes(routes);
	if (isEventsScheduleNavPath(withoutQuery)) {
		return leaves.find((n) => n.id === "events-schedule") ?? null;
	}
	const exact = leaves.find((n) => n.path === withoutQuery);
	if (exact) return exact;
	const ranked = leaves
		.filter((n) => {
			const href = n.path;
			return Boolean(
				href &&
					href !== "/" &&
					(withoutQuery === href || withoutQuery.startsWith(`${href}/`)),
			);
		})
		.sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0));
	if (ranked[0]) return ranked[0];
	if (withoutQuery === "/" || withoutQuery === "") {
		return leaves.find((n) => n.path === "/") ?? null;
	}
	return null;
}

export function navGroupContains(
	group: NavRoute,
	active: NavRoute | null,
): boolean {
	if (!active || !group.children?.length) return false;
	return flattenNavRoutes([group]).some((leaf) => leaf.id === active.id);
}
