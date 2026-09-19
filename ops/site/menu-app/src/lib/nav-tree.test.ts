import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	flattenNavRoutes,
	matchActiveRoute,
	navGroupContains,
} from "./nav-tree.ts";
import { NAV_ROUTES } from "./nav-routes.ts";

const routes = NAV_ROUTES;

describe("flattenNavRoutes", () => {
	it("returns only leaves, not Stock or Menu groups", () => {
		assert.deepEqual(
			flattenNavRoutes(routes).map((row) => row.id),
			["home", "recipes", "inventory", "sections", "users", "config"],
		);
	});
});

describe("matchActiveRoute", () => {
	it("matches nested stock pages and drink editors to the leaf", () => {
		assert.equal(matchActiveRoute(routes, "/menu")?.id, "recipes");
		assert.equal(matchActiveRoute(routes, "/menu/negroni")?.id, "recipes");
		assert.equal(matchActiveRoute(routes, "/inventory/gin")?.id, "inventory");
		assert.equal(matchActiveRoute(routes, "/sections")?.id, "sections");
		assert.equal(matchActiveRoute(routes, "/config")?.id, "config");
		assert.equal(matchActiveRoute(routes, "/")?.id, "home");
		assert.equal(matchActiveRoute(routes, "/users")?.id, "users");
	});

	it("does not treat Stock or Menu groups as the active page", () => {
		assert.notEqual(matchActiveRoute(routes, "/menu")?.id, "stock");
		assert.notEqual(matchActiveRoute(routes, "/sections")?.id, "menu");
	});
});

describe("navGroupContains", () => {
	it("puts recipes and inventory under Stock, sections under Menu", () => {
		const stock = routes.find((row) => row.id === "stock")!;
		const menu = routes.find((row) => row.id === "menu")!;
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/menu")), true);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/inventory")), true);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/sections")), false);
		assert.equal(navGroupContains(menu, matchActiveRoute(routes, "/sections")), true);
		assert.equal(navGroupContains(menu, matchActiveRoute(routes, "/menu")), false);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/")), false);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/users")), false);
	});
});
