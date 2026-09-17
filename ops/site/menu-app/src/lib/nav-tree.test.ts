import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavRoute } from "../shell/types.ts";
import {
	flattenNavRoutes,
	matchActiveRoute,
	navGroupContains,
} from "./nav-tree.ts";

const routes: NavRoute[] = [
	{ id: "home", path: "/", name: "Dashboard", icon: "home" },
	{
		id: "stock",
		name: "Stock",
		icon: "stock",
		children: [
			{ id: "menu", path: "/menu", name: "Menu Items", icon: "menu" },
			{ id: "inventory", path: "/inventory", name: "Inventory", icon: "inventory" },
			{ id: "sections", path: "/sections", name: "Sections", icon: "list" },
			{ id: "config", path: "/config", name: "Configuration", icon: "settings" },
		],
	},
	{ id: "users", path: "/users", name: "Users", icon: "users" },
];

describe("flattenNavRoutes", () => {
	it("returns only leaves, not the Stock group", () => {
		assert.deepEqual(
			flattenNavRoutes(routes).map((row) => row.id),
			["home", "menu", "inventory", "sections", "config", "users"],
		);
	});
});

describe("matchActiveRoute", () => {
	it("matches nested stock pages and drink editors to the leaf", () => {
		assert.equal(matchActiveRoute(routes, "/menu")?.id, "menu");
		assert.equal(matchActiveRoute(routes, "/menu/negroni")?.id, "menu");
		assert.equal(matchActiveRoute(routes, "/inventory/gin")?.id, "inventory");
		assert.equal(matchActiveRoute(routes, "/sections")?.id, "sections");
		assert.equal(matchActiveRoute(routes, "/config")?.id, "config");
		assert.equal(matchActiveRoute(routes, "/")?.id, "home");
		assert.equal(matchActiveRoute(routes, "/users")?.id, "users");
	});

	it("does not treat the Stock group as the active page", () => {
		assert.notEqual(matchActiveRoute(routes, "/menu")?.id, "stock");
	});
});

describe("navGroupContains", () => {
	it("is true when a Stock child is active", () => {
		const stock = routes[1];
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/config")), true);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/")), false);
		assert.equal(navGroupContains(stock, matchActiveRoute(routes, "/users")), false);
	});
});
