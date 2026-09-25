import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileTabFor, mobileTabs, sheetSections, tabHref } from "./mobile-nav.ts";
import { NAV_ROUTES } from "./nav-routes.ts";
import { flattenNavRoutes } from "./nav-tree.ts";

describe("mobileTabs", () => {
	it("follows the side rail: Home, Service, Programme, Website, More", () => {
		assert.deepEqual(
			mobileTabs().map((tab) => tab.label),
			["Home", "Service", "Programme", "Website", "More"],
		);
	});
});

describe("mobileTabFor", () => {
	it("maps pages to their rail section", () => {
		assert.equal(mobileTabFor("/"), "home");
		assert.equal(mobileTabFor("/menu"), "service");
		assert.equal(mobileTabFor("/menu/negroni"), "service");
		assert.equal(mobileTabFor("/sections"), "service");
		assert.equal(mobileTabFor("/inventory"), "service");
		assert.equal(mobileTabFor("/suppliers"), "service");
		assert.equal(mobileTabFor("/lightspeed/export"), "service");
		assert.equal(mobileTabFor("/events"), "programme");
		assert.equal(mobileTabFor("/events/schedule"), "programme");
		assert.equal(mobileTabFor("/artists"), "programme");
		assert.equal(mobileTabFor("/forms"), "programme");
	});

	it("gives Website its own tab and puts settings on More", () => {
		assert.equal(mobileTabFor("/web"), "web");
		assert.equal(mobileTabFor("/web/dev"), "more");
		assert.equal(mobileTabFor("/users"), "more");
		assert.equal(mobileTabFor("/config"), "more");
	});
});

describe("sheetSections", () => {
	const ids = (tab: Parameters<typeof sheetSections>[0]) =>
		flattenNavRoutes(sheetSections(tab)).map((row) => row.id);

	it("lists every rail page exactly once across the tabs", () => {
		const listed = [
			"home",
			"web",
			...ids("service"),
			...ids("programme"),
			...ids("more"),
		].sort();
		const rail = flattenNavRoutes(NAV_ROUTES)
			.map((row) => row.id)
			.sort();
		assert.deepEqual(listed, rail);
	});

	it("keeps Website out of the Programme sheet", () => {
		assert.ok(!ids("programme").includes("web"));
		assert.deepEqual(ids("home"), []);
		assert.equal(tabHref("service"), "/menu");
		assert.equal(tabHref("more"), "/users");
	});
});
