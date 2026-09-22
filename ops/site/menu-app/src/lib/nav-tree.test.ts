import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	flattenNavRoutes,
	matchActiveRoute,
	navGroupContains,
} from "./nav-tree.ts";
import { NAV_ROUTES } from "./nav-routes.ts";

const routes = NAV_ROUTES;

describe("NAV_ROUTES", () => {
	it("puts Menu, Stock, then Lightspeed after Dashboard", () => {
		assert.equal(routes[0]?.id, "home");
		assert.equal(routes[1]?.id, "menu");
		assert.deepEqual(
			routes[1]?.children?.map((row) => row.id),
			["recipes", "sections"],
		);
		assert.equal(routes[2]?.id, "stock");
		assert.deepEqual(
			routes[2]?.children?.map((row) => row.id),
			["inventory", "suppliers"],
		);
		assert.equal(routes[3]?.id, "lightspeed");
		assert.deepEqual(
			routes[3]?.children?.map((row) => row.id),
			["lightspeed-reconcile", "lightspeed-export"],
		);
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
				"events",
				"web",
				"users",
				"config",
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
		assert.equal(matchActiveRoute(routes, "/events")?.id, "events");
		assert.equal(matchActiveRoute(routes, "/events/new")?.id, "events");
		assert.equal(matchActiveRoute(routes, "/web")?.id, "web");
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
		const stock = routes.find((row) => row.id === "stock")!;
		const menu = routes.find((row) => row.id === "menu")!;
		const lightspeed = routes.find((row) => row.id === "lightspeed")!;
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
	});
});
