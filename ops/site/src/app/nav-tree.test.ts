import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	flattenNavRoutes,
	matchActiveRoute,
	navGroupContains,
} from "./nav-tree.ts";
import { NAV_ROUTES } from "./nav-routes.ts";
import { visibleRoutes } from "./nav-tree.ts";

const routes = NAV_ROUTES;

describe("NAV_ROUTES", () => {
	it("puts Menu, Stock, and Lightspeed under a Service header", () => {
		assert.equal(routes[0]?.id, "home");
		const service = routes[1];
		assert.equal(service?.id, "service");
		assert.equal(service?.heading, true);
		assert.equal(service?.name, "Service");
		assert.deepEqual(
			service?.children?.map((row) => row.id),
			["menu", "stock", "lightspeed"],
		);
		const menu = service?.children?.find((row) => row.id === "menu");
		const stock = service?.children?.find((row) => row.id === "stock");
		const lightspeed = service?.children?.find((row) => row.id === "lightspeed");
		assert.deepEqual(
			menu?.children?.map((row) => row.id),
			["recipes", "sections"],
		);
		assert.deepEqual(
			stock?.children?.map((row) => row.id),
			["inventory", "suppliers"],
		);
		assert.deepEqual(
			lightspeed?.children?.map((row) => row.id),
			["lightspeed-reconcile", "lightspeed-export"],
		);
		const programme = routes[2];
		assert.equal(programme?.id, "programme");
		assert.equal(programme?.heading, true);
		assert.deepEqual(
			programme?.children?.map((row) => row.id),
			["events", "artists", "web"],
		);
		assert.deepEqual(
			programme?.children?.find((row) => row.id === "artists")?.children?.map((row) => row.id),
			["artist", "forms"],
		);
		assert.equal(programme?.children?.find((row) => row.id === "web")?.badge, "website");
		assert.deepEqual(
			programme?.children?.find((row) => row.id === "events")?.children?.map((row) => row.id),
			["events-series", "events-schedule"],
		);
		const settings = routes[3];
		assert.equal(settings?.id, "settings");
		assert.equal(settings?.heading, true);
		assert.deepEqual(
			settings?.children?.map((row) => row.id),
			["users", "config", "dev-tools"],
		);
	});
});

describe("phone tab strip labels", () => {
	it("gives long names a short one, so the strip fits a phone", () => {
		const leaves = flattenNavRoutes(routes);
		const short = (id: string) => leaves.find((row) => row.id === id)?.short;
		assert.equal(short("artist"), "Artist");
		assert.equal(short("forms"), "Applications");
		for (const leaf of leaves) {
			assert.ok((leaf.short || leaf.name).length <= 15, `${leaf.id} needs a shorter label`);
		}
	});

	it("leaves the More page out of the rail", () => {
		assert.equal(matchActiveRoute(routes, "/more"), null);
	});
});

describe("flattenNavRoutes", () => {
	it("returns only leaves, not Menu, Stock, or Lightspeed groups", () => {
		assert.deepEqual(
			flattenNavRoutes(routes).map((row) => row.id),
			[
				"home",
				"recipes",
				"sections",
				"inventory",
				"suppliers",
				"lightspeed-reconcile",
				"lightspeed-export",
				"events-series",
				"events-schedule",
				"artist",
				"forms",
				"web",
				"users",
				"config",
				"dev-tools",
			],
		);
	});
});

describe("matchActiveRoute", () => {
	it("matches nested pages and drink editors to the leaf", () => {
		assert.equal(matchActiveRoute(routes, "/menu")?.id, "recipes");
		assert.equal(matchActiveRoute(routes, "/menu/negroni")?.id, "recipes");
		assert.equal(matchActiveRoute(routes, "/inventory/gin")?.id, "inventory");
		assert.equal(matchActiveRoute(routes, "/lightspeed")?.id, "lightspeed-reconcile");
		assert.equal(matchActiveRoute(routes, "/lightspeed/export")?.id, "lightspeed-export");
		assert.equal(matchActiveRoute(routes, "/suppliers")?.id, "suppliers");
		assert.equal(matchActiveRoute(routes, "/sections")?.id, "sections");
		assert.equal(matchActiveRoute(routes, "/config")?.id, "config");
		assert.equal(matchActiveRoute(routes, "/events")?.id, "events-series");
		assert.equal(matchActiveRoute(routes, "/events/new")?.id, "events-series");
		assert.equal(matchActiveRoute(routes, "/events/12")?.id, "events-series");
		assert.equal(matchActiveRoute(routes, "/events/12/schedule")?.id, "events-series");
		assert.equal(matchActiveRoute(routes, "/events/schedule")?.id, "events-schedule");
		assert.equal(matchActiveRoute(routes, "/events/nights")?.id, "events-schedule");
		assert.equal(
			matchActiveRoute(routes, "/events/12@2026-09-25")?.id,
			"events-schedule",
		);
		assert.equal(
			matchActiveRoute(routes, "/events/12%402026-09-25")?.id,
			"events-schedule",
		);
		assert.equal(matchActiveRoute(routes, "/events/new/once")?.id, "events-schedule");
		assert.equal(matchActiveRoute(routes, "/artists")?.id, "artist");
		assert.equal(matchActiveRoute(routes, "/artists/new")?.id, "artist");
		assert.equal(matchActiveRoute(routes, "/artists/3")?.id, "artist");
		assert.equal(matchActiveRoute(routes, "/web")?.id, "web");
		assert.equal(matchActiveRoute(routes, "/forms")?.id, "forms");
		assert.equal(matchActiveRoute(routes, "/")?.id, "home");
		assert.equal(matchActiveRoute(routes, "/users")?.id, "users");
	});

	it("does not treat groups as the active page", () => {
		assert.notEqual(matchActiveRoute(routes, "/menu")?.id, "stock");
		assert.notEqual(matchActiveRoute(routes, "/sections")?.id, "menu");
		assert.notEqual(matchActiveRoute(routes, "/lightspeed")?.id, "lightspeed");
	});
});

describe("navGroupContains", () => {
	it("puts menu under Menu, inventory under Stock, reconcile under Lightspeed", () => {
		const service = routes.find((row) => row.id === "service")!;
		const stock = service.children?.find((row) => row.id === "stock")!;
		const menu = service.children?.find((row) => row.id === "menu")!;
		const lightspeed = service.children?.find((row) => row.id === "lightspeed")!;
		assert.equal(navGroupContains(menu, matchActiveRoute(routes, "/menu")), true);
		assert.equal(navGroupContains(menu, matchActiveRoute(routes, "/sections")), true);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/menu")), false);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/inventory")), true);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/lightspeed")), false);
		assert.equal(navGroupContains(lightspeed, matchActiveRoute(routes, "/lightspeed")), true);
		assert.equal(
			navGroupContains(lightspeed, matchActiveRoute(routes, "/lightspeed/export")),
			true,
		);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/suppliers")), true);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/sections")), false);
		assert.equal(navGroupContains(menu, matchActiveRoute(routes, "/inventory")), false);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/")), false);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/users")), false);
		const events = routes
			.find((row) => row.id === "programme")
			?.children?.find((row) => row.id === "events")!;
		assert.equal(navGroupContains(events, matchActiveRoute(routes, "/events")), true);
		assert.equal(
			navGroupContains(events, matchActiveRoute(routes, "/events/schedule")),
			true,
		);
		assert.equal(navGroupContains(events, matchActiveRoute(routes, "/web")), false);
	});
});

describe("visibleRoutes", () => {
	it("hides developer tools from non-admins", () => {
		const ids = (list: typeof routes) =>
			list.find((row) => row.id === "settings")?.children?.map((row) => row.id);
		assert.deepEqual(ids(visibleRoutes(routes, false)), ["users", "config"]);
		assert.deepEqual(ids(visibleRoutes(routes, true)), ["users", "config", "dev-tools"]);
	});
});
