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

/** Longest matching leaf for the current path. */
export function matchActiveRoute(
	routes: NavRoute[],
	path: string,
): NavRoute | null {
	const withoutQuery = path.split("?")[0] ?? "/";
	const leaves = flattenNavRoutes(routes);
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
