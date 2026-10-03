import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	LAST_PAGE_KEY,
	backToMore,
	firstPage,
	groupPages,
	hideShellChrome,
	lastPage,
	mobileTabFor,
	mobileTabs,
	readLastPages,
	rememberPage,
	stripGroups,
	type MobileTabId,
} from "./mobile-nav.ts";
import { NAV_ROUTES } from "./nav-routes.ts";
import { flattenNavRoutes, visibleRoutes } from "./nav-tree.ts";

const staff = visibleRoutes(NAV_ROUTES, false);
const admin = visibleRoutes(NAV_ROUTES, true);

function ids(tab: MobileTabId, routes = admin): string[][] {
	return groupPages(tab, routes).map((group) => group.pages.map((row) => row.id));
}

function labels(tab: MobileTabId, routes = admin): string[] {
	return stripGroups(tab, routes).flatMap((group) => group.pages.map((row) => row.short || row.name));
}

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		data,
	};
}

describe("mobileTabs", () => {
	it("keeps the bar to Home, Service, Programme, Website, More", () => {
		assert.deepEqual(
			mobileTabs().map((tab) => tab.label),
			["Home", "Service", "Programme", "Website", "More"],
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

describe("groupPages", () => {
	it("splits Service where the rail does", () => {
		assert.deepEqual(ids("service"), [
			["recipes"],
			["inventory", "suppliers"],
			["lightspeed-reconcile", "lightspeed-export"],
		]);
	});

	it("keeps Website out of Programme", () => {
		assert.deepEqual(ids("programme"), [
			["events-series", "events-schedule"],
			["artist", "forms"],
		]);
	});

	it("gives Website its page and, for admins, Developer tools", () => {
		assert.deepEqual(ids("website"), [["web", "dev-tools"]]);
		assert.deepEqual(ids("website", staff), [["web"]]);
	});

	it("lists settings on More, with Developer tools for admins only", () => {
		assert.deepEqual(ids("more"), [["users", "config", "dev-tools"]]);
		assert.deepEqual(ids("more", staff), [["users", "config"]]);
		assert.deepEqual(ids("home"), []);
	});

	it("reaches every rail page from the bar", () => {
		const listed = new Set(
			(["service", "programme", "website", "more"] as MobileTabId[]).flatMap((tab) => ids(tab).flat()),
		);
		listed.add("home");
		const rail = flattenNavRoutes(admin).map((row) => row.id);
		assert.deepEqual(
			rail.filter((id) => !listed.has(id)),
			[],
		);
	});
});

describe("stripGroups", () => {
	it("uses the short names", () => {
		assert.deepEqual(labels("service"), [
			"Menu items",
			"Inventory",
			"Suppliers",
			"Reconcile",
			"Export",
		]);
		assert.deepEqual(labels("programme"), ["Series", "Schedule", "Artist", "Applications"]);
		assert.deepEqual(labels("website"), ["Website", "Developer tools"]);
	});

	it("has no strip with nothing to switch to", () => {
		assert.deepEqual(stripGroups("website", staff), []);
		assert.deepEqual(stripGroups("home", admin), []);
		assert.deepEqual(stripGroups("more", admin), []);
	});
});

describe("mobileTabFor", () => {
	it("maps pages to their tab", () => {
		assert.equal(mobileTabFor("/"), "home");
		assert.equal(mobileTabFor("/menu"), "service");
		assert.equal(mobileTabFor("/menu/negroni"), "service");
		assert.equal(mobileTabFor("/config/sections"), "more");
		assert.equal(mobileTabFor("/inventory"), "service");
		assert.equal(mobileTabFor("/suppliers"), "service");
		assert.equal(mobileTabFor("/lightspeed/export"), "service");
		assert.equal(mobileTabFor("/events"), "programme");
		assert.equal(mobileTabFor("/events/schedule"), "programme");
		assert.equal(mobileTabFor("/artists"), "programme");
		assert.equal(mobileTabFor("/forms"), "programme");
	});

	it("puts Website and Developer tools on Website, settings on More", () => {
		assert.equal(mobileTabFor("/web"), "website");
		assert.equal(mobileTabFor("/web/dev"), "website");
		assert.equal(mobileTabFor("/web/dev/settings"), "website");
		assert.equal(mobileTabFor("/users"), "more");
		assert.equal(mobileTabFor("/config"), "more");
		assert.equal(mobileTabFor("/more"), "more");
	});
});

describe("backToMore", () => {
	it("shows on settings pages, not on More or the other tabs", () => {
		assert.equal(backToMore("/users"), true);
		assert.equal(backToMore("/config"), true);
		assert.equal(backToMore("/more"), false);
		assert.equal(backToMore("/web/dev"), false);
		assert.equal(backToMore("/"), false);
	});
});

describe("lastPage", () => {
	it("falls back to the first page of the tab", () => {
		assert.equal(lastPage("home", admin, {}), "/");
		assert.equal(lastPage("service", admin, {}), "/menu");
		assert.equal(lastPage("programme", admin, {}), "/events");
		assert.equal(lastPage("website", admin, {}), "/web");
		assert.equal(lastPage("more", admin, {}), "/more");
		assert.equal(firstPage("website", admin), "/web");
	});

	it("returns to the last page used in a tab", () => {
		assert.equal(lastPage("service", admin, { service: "/suppliers" }), "/suppliers");
		assert.equal(lastPage("website", admin, { website: "/web/dev" }), "/web/dev");
	});

	it("ignores a remembered page the tab no longer has", () => {
		assert.equal(lastPage("website", staff, { website: "/web/dev" }), "/web");
		assert.equal(lastPage("service", admin, { service: "/events" }), "/menu");
	});

	it("remembers the rail page, not the record that was open", () => {
		const storage = memoryStorage();
		rememberPage("/events/schedule", NAV_ROUTES, storage);
		rememberPage("/inventory/gin", NAV_ROUTES, storage);
		rememberPage("/users", NAV_ROUTES, storage);
		assert.deepEqual(readLastPages(storage), {
			programme: "/events/schedule",
			service: "/inventory",
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
		assert.equal(hideShellChrome("/menu/print"), true);
		assert.equal(hideShellChrome("/menu"), false);
		assert.equal(hideShellChrome("/more"), false);
	});
});
