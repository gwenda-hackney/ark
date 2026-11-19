import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	LAST_PAGE_KEY,
	backToMore,
	firstPage,
	hideShellChrome,
	lastPage,
	mobileTabFor,
	mobileTabs,
	readLastPages,
	rememberPage,
	stripPages,
	tabPages,
	type MobileTabId,
} from "./mobile-nav.ts";
import { NAV_ROUTES } from "./nav-routes.ts";
import { flattenNavRoutes, visibleRoutes } from "./nav-tree.ts";

const staff = visibleRoutes(NAV_ROUTES, false);
const admin = visibleRoutes(NAV_ROUTES, true);

function ids(tab: MobileTabId, routes = admin): string[] {
	return tabPages(tab, routes).map((row) => row.id);
}

function labels(tab: MobileTabId, routes = admin): string[] {
	return stripPages(tab, routes).map((row) => row.short || row.name);
}

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		data,
	};
}

describe("mobileTabs (#312)", () => {
	it("reads Home · What's on · Bar & kitchen · Website · More", () => {
		assert.deepEqual(
			mobileTabs().map((tab) => tab.label),
			["Home", "What's on", "Bar & kitchen", "Website", "More"],
		);
	});

	it("puts the website count on the Website tab", () => {
		assert.deepEqual(
			mobileTabs()
				.filter((tab) => tab.badge === "website")
				.map((tab) => tab.id),
			["website"],
		);
	});
});

describe("tabPages", () => {
	it("gives each tab its rail heading's pages", () => {
		assert.deepEqual(ids("whats-on"), ["schedule", "events", "popups", "deals", "occasions", "artists", "email", "photos"]);
		assert.deepEqual(ids("bar-kitchen"), ["menus", "recipes", "stock"]);
		assert.deepEqual(ids("website"), ["web"]);
	});

	it("lists settings on More, with Developer tools for admins only", () => {
		assert.deepEqual(ids("more"), ["venue", "users", "lightspeed", "config", "dev-tools"]);
		assert.deepEqual(ids("more", staff), ["venue", "users", "lightspeed", "config"]);
		assert.deepEqual(ids("home"), []);
	});

	it("reaches every rail page from the bar", () => {
		const listed = new Set(
			(["whats-on", "bar-kitchen", "website", "more"] as MobileTabId[]).flatMap((tab) => ids(tab)),
		);
		listed.add("home");
		const rail = flattenNavRoutes(admin).map((row) => row.id);
		assert.deepEqual(
			rail.filter((id) => !listed.has(id)),
			[],
		);
	});
});

describe("stripPages", () => {
	it("uses the short names", () => {
		assert.deepEqual(labels("whats-on"), ["Schedule", "Events", "Pop-ups", "Deals", "Occasions", "Artists", "Email", "Photos"]);
		assert.deepEqual(labels("bar-kitchen"), ["Menus", "Items", "Stock"]);
		// Website is one page now: nothing to switch between.
		assert.deepEqual(stripPages("website", admin), []);
	});

	it("has no strip on Home or More", () => {
		assert.deepEqual(stripPages("home", admin), []);
		assert.deepEqual(stripPages("more", admin), []);
	});
});

describe("mobileTabFor", () => {
	it("maps pages, their tabs and what's opened in them to their tab", () => {
		assert.equal(mobileTabFor("/"), "home");
		assert.equal(mobileTabFor("/events/schedule"), "whats-on");
		assert.equal(mobileTabFor("/events"), "whats-on");
		assert.equal(mobileTabFor("/events/12@2026-09-25"), "whats-on");
		assert.equal(mobileTabFor("/popups/36"), "whats-on");
		assert.equal(mobileTabFor("/deals"), "whats-on");
		assert.equal(mobileTabFor("/artists"), "whats-on");
		assert.equal(mobileTabFor("/forms/12"), "whats-on");
		assert.equal(mobileTabFor("/menus"), "bar-kitchen");
		assert.equal(mobileTabFor("/menu/negroni"), "bar-kitchen");
		assert.equal(mobileTabFor("/inventory"), "bar-kitchen");
		assert.equal(mobileTabFor("/suppliers"), "bar-kitchen");
	});

	it("puts the email and Photos on What's on, Website on Website, settings on More", () => {
		assert.equal(mobileTabFor("/web"), "website");
		assert.equal(mobileTabFor("/email"), "whats-on");
		assert.equal(mobileTabFor("/venue/gallery"), "whats-on");
		assert.equal(mobileTabFor("/venue"), "more");
		assert.equal(mobileTabFor("/users"), "more");
		assert.equal(mobileTabFor("/lightspeed/export"), "more");
		assert.equal(mobileTabFor("/config"), "more");
		assert.equal(mobileTabFor("/web/dev"), "more");
		assert.equal(mobileTabFor("/more"), "more");
	});
});

describe("backToMore", () => {
	it("shows on settings pages, not on More or the other tabs", () => {
		assert.equal(backToMore("/users"), true);
		assert.equal(backToMore("/config"), true);
		assert.equal(backToMore("/lightspeed"), true);
		assert.equal(backToMore("/more"), false);
		assert.equal(backToMore("/web"), false);
		assert.equal(backToMore("/"), false);
	});
});

describe("lastPage", () => {
	it("falls back to the first page of the tab", () => {
		assert.equal(lastPage("home", admin, {}), "/");
		assert.equal(lastPage("whats-on", admin, {}), "/events/schedule");
		assert.equal(lastPage("bar-kitchen", admin, {}), "/menus");
		assert.equal(lastPage("website", admin, {}), "/web");
		assert.equal(lastPage("more", admin, {}), "/more");
		assert.equal(firstPage("website", admin), "/web");
	});

	it("returns to the last page used in a tab", () => {
		assert.equal(lastPage("bar-kitchen", admin, { "bar-kitchen": "/inventory" }), "/inventory");
		assert.equal(lastPage("whats-on", admin, { "whats-on": "/email" }), "/email");
	});

	it("ignores a remembered page the tab no longer has", () => {
		assert.equal(lastPage("bar-kitchen", admin, { "bar-kitchen": "/events" }), "/menus");
		// Before #312 the tabs were Service and Programme.
		assert.equal(lastPage("whats-on", admin, { programme: "/events" } as never), "/events/schedule");
	});

	it("remembers the rail page, not the record or tab that was open", () => {
		const storage = memoryStorage();
		rememberPage("/popups/36", NAV_ROUTES, storage);
		rememberPage("/suppliers", NAV_ROUTES, storage);
		rememberPage("/users", NAV_ROUTES, storage);
		assert.deepEqual(readLastPages(storage), {
			"whats-on": "/popups",
			"bar-kitchen": "/inventory",
		});
	});

	it("survives storage that throws or holds junk", () => {
		const broken = {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
		};
		assert.deepEqual(readLastPages(broken), {});
		assert.doesNotThrow(() => rememberPage("/menu", NAV_ROUTES, broken));
		assert.deepEqual(readLastPages(memoryStorage({ [LAST_PAGE_KEY]: "{nope" })), {});
		assert.deepEqual(readLastPages(null), {});
	});
});

describe("hideShellChrome", () => {
	it("hides the bar and strip in editors and the print book", () => {
		assert.equal(hideShellChrome("/menu/negroni"), true);
		assert.equal(hideShellChrome("/events/new"), true);
		assert.equal(hideShellChrome("/popups/36"), true);
		assert.equal(hideShellChrome("/menu/print"), true);
		assert.equal(hideShellChrome("/menu"), false);
		assert.equal(hideShellChrome("/popups"), false);
		assert.equal(hideShellChrome("/more"), false);
	});
});
