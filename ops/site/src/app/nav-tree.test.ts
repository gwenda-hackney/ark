import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	flattenNavRoutes,
	isPagePath,
	matchActiveRoute,
	pageFrame,
	areaOfPath,
	pageTabs,
	visibleRoutes,
} from "./nav-tree.ts";
import { NAV_ROUTES } from "./nav-routes.ts";
import { FEATURED_ARTIST_CLOSED } from "../artists/featured-artist.js";
import { canonicalizePath, parseShellPath } from "./spa-path.js";

const routes = NAV_ROUTES;

describe("NAV_ROUTES (#312)", () => {
	it("is one level, grouped by the job: What's on, Bar & kitchen, Publish, Settings", () => {
		assert.deepEqual(
			routes.map((row) => [row.id, row.name, Boolean(row.heading)]),
			[
				["home", "Dashboard", false],
				["whats-on", "What's on", true],
				["bar-kitchen", "Bar & kitchen", true],
				["publish", "Publish", true],
				["settings", "Settings", true],
			],
		);
		const names = (id: string) => routes.find((row) => row.id === id)?.children?.map((row) => row.name);
		assert.deepEqual(names("whats-on"), ["Schedule", "Events", "Pop-ups", "Deals", "Occasions", "Enquiries", "Email", "Photos"]);
		assert.deepEqual(names("bar-kitchen"), ["Menus", "Items", "Stock"]);
		assert.deepEqual(names("publish"), ["Website"]);
		assert.deepEqual(names("settings"), ["Venue", "Users", "Lightspeed", "Configuration", "Developer tools"]);
	});

	it("has no groups inside groups: every heading holds pages only", () => {
		for (const heading of routes.filter((row) => row.heading)) {
			for (const page of heading.children || []) {
				assert.equal(page.children, undefined, `${page.id} is a group`);
				assert.ok(page.path, `${page.id} goes nowhere`);
			}
		}
	});

	it("gives each page a different address", () => {
		const paths = flattenNavRoutes(routes).map((row) => row.path);
		assert.equal(new Set(paths).size, paths.length);
	});

	it("puts the website count on Website, and Developer tools behind admin", () => {
		const leaves = flattenNavRoutes(routes);
		assert.deepEqual(leaves.filter((row) => row.badge === "website").map((row) => row.id), ["web"]);
		assert.deepEqual(leaves.filter((row) => row.adminOnly).map((row) => row.id), ["dev-tools"]);
	});
});

describe("pages with tabs", () => {
	it("Stock and Lightspeed are one page each, with their old pages as tabs; Enquiries has none", () => {
		const tabs = (id: string) => pageTabs(routes, id).map((tab) => [tab.label, tab.href]);
		assert.deepEqual(tabs("artists"), [], "the Featured artist tab is gone");
		assert.deepEqual(tabs("stock"), [
			["Inventory", "/inventory"],
			["Suppliers", "/suppliers"],
		]);
		assert.deepEqual(tabs("lightspeed"), [
			["Reconcile", "/lightspeed"],
			["Export", "/lightspeed/export"],
		]);
		assert.deepEqual(pageTabs(routes, "events"), [], "a page without tabs has none");
	});

	it("Enquiries is every form's replies, at /enquiries, with no tabs", () => {
		const enquiries = flattenNavRoutes(routes).find((row) => row.id === "artists");
		assert.deepEqual([enquiries?.name, enquiries?.path, enquiries?.tabs], ["Enquiries", "/enquiries", undefined]);
		assert.ok(pageTabs(routes, "stock").every((tab) => !tab.badge), "no tab carries a badge");
	});

	it("opens on its first tab", () => {
		for (const page of flattenNavRoutes(routes).filter((row) => row.tabs?.length)) {
			assert.equal(page.tabs?.[0]?.path, page.path, page.id);
		}
	});

	it("lights the page on every tab, and on a record opened in one", () => {
		const page = (path: string) => matchActiveRoute(routes, path)?.id;
		assert.equal(page("/suppliers"), "stock");
		assert.equal(page("/inventory/gin"), "stock");
		assert.equal(page("/enquiries"), "artists");
		assert.equal(page("/enquiries/12"), "artists");
		assert.equal(page("/lightspeed/export"), "lightspeed");
		assert.equal(page("/lightspeed/menus"), "lightspeed");
	});

	it("knows the page itself (any tab) from a record opened in it", () => {
		const stock = matchActiveRoute(routes, "/suppliers");
		assert.equal(isPagePath(stock, "/inventory"), true);
		assert.equal(isPagePath(stock, "/suppliers"), true);
		assert.equal(isPagePath(stock, "/inventory/gin"), false);
		assert.equal(isPagePath(null, "/inventory"), false);
	});

	it("shows a page's tabs in one frame, so a tab switch keeps them in place", () => {
		assert.equal(pageFrame(routes, "/inventory"), "stock");
		assert.equal(pageFrame(routes, "/suppliers"), "stock");
		assert.equal(pageFrame(routes, "/inventory/gin"), "stock");
		assert.equal(pageFrame(routes, "/enquiries/12"), "forms", "Enquiries has no tabs: its own frame");
		assert.equal(pageFrame(routes, "/lightspeed/export"), "lightspeed");
		assert.equal(pageFrame(routes, "/events"), "events");
		assert.equal(pageFrame(routes, "/popups/36"), "events");
		assert.equal(pageFrame(routes, "/config/tasks"), "config");
		assert.equal(pageFrame(routes, "/more"), "more");
		assert.equal(pageFrame(routes, "/"), "home");
	});
});

describe("phone tab strip labels", () => {
	it("keeps names short, so the strip fits a phone", () => {
		for (const leaf of flattenNavRoutes(routes)) {
			assert.ok((leaf.short || leaf.name).length <= 15, `${leaf.id} needs a shorter label`);
		}
	});

	it("leaves the More page out of the rail", () => {
		assert.equal(matchActiveRoute(routes, "/more"), null);
	});
});

describe("matchActiveRoute", () => {
	it("lights Events, Pop-ups and Deals for their lists, their Add and what's opened in them", () => {
		const page = (path: string) => matchActiveRoute(routes, path)?.id;
		assert.equal(page("/events"), "events");
		assert.equal(page("/events/new"), "events");
		assert.equal(page("/events/12"), "events");
		assert.equal(page("/events/12/schedule"), "events");
		assert.equal(page("/popups"), "popups");
		assert.equal(page("/popups/new"), "popups");
		assert.equal(page("/popups/36/gallery"), "popups");
		assert.equal(page("/deals"), "deals");
		assert.equal(page("/deals/34"), "deals");
	});

	it("lights Schedule for the calendar, its Add and any night", () => {
		const page = (path: string) => matchActiveRoute(routes, path)?.id;
		assert.equal(page("/events/schedule"), "schedule");
		assert.equal(page("/events/nights"), "schedule");
		assert.equal(page("/events/new/once"), "schedule");
		assert.equal(page("/events/12@2026-09-25"), "schedule");
		assert.equal(page("/events/12%402026-09-25"), "schedule");
	});

	it("matches the rest, longest address first", () => {
		const page = (path: string) => matchActiveRoute(routes, path)?.id;
		assert.equal(page("/"), "home");
		assert.equal(page("/menus"), "menus");
		assert.equal(page("/menus/3"), "menus");
		assert.equal(page("/menu"), "recipes");
		assert.equal(page("/menu/negroni"), "recipes");
		assert.equal(page("/web"), "web");
		assert.equal(page("/web/dev"), "dev-tools");
		assert.equal(page("/web/dev/settings"), "dev-tools");
		assert.equal(page("/email"), "email");
		assert.equal(page("/email/sent"), "email");
		assert.equal(page("/email/people"), "email");
		assert.equal(page("/email/settings"), "email");
		assert.equal(page("/email/write"), "email");
		assert.equal(page("/email/write/12"), "email");
		assert.equal(page("/venue"), "venue");
		assert.equal(page("/venue/gallery"), "photos");
		assert.equal(page("/users"), "users");
		assert.equal(page("/config"), "config");
		assert.equal(page("/config/pour"), "config");
	});

	it("opens every old address on its new page (#312)", () => {
		const opens = (path: string) => [matchActiveRoute(routes, path)?.id, parseShellPath(path).page];
		assert.deepEqual(opens("/events"), ["events", "events"]);
		assert.deepEqual(opens("/inventory"), ["stock", "inventory"]);
		assert.deepEqual(opens("/suppliers"), ["stock", "suppliers"]);
		assert.deepEqual(opens(canonicalizePath("/forms")), ["artists", "forms"], "Enquiries was Forms");
		assert.deepEqual(opens(canonicalizePath("/forms/12")), ["artists", "forms"]);
		assert.deepEqual(opens(canonicalizePath("/artists")), ["artists", "forms"], "Featured artist is gone: Enquiries");
		assert.deepEqual(opens(canonicalizePath("/artists/3")), ["artists", "forms"]);
		assert.deepEqual(opens("/lightspeed"), ["lightspeed", "lightspeed"]);
		assert.deepEqual(opens("/lightspeed/export"), ["lightspeed", "lightspeed"]);
		assert.deepEqual(opens("/venue/gallery"), ["photos", "venue"]);
		// Menu sections live on each menu now: the Menus page takes it to /menus (#305).
		assert.equal(parseShellPath("/config/sections").page, "menus");
	});
});

describe("access by area (#375)", () => {
	const levels: Record<string, string> = { "whats-on": "edit", email: "view", "email-people": "none", menus: "none" };
	const see = (area?: string) => !area || (levels[area] ?? "none") !== "none";

	it("the menu leaves out pages they have no access to, and headings left empty", () => {
		const ids = visibleRoutes(routes, false, see).map((row) => [row.id, row.children?.map((child) => child.id)]);
		assert.deepEqual(ids, [
			["home", undefined],
			["whats-on", ["schedule", "events", "popups", "deals", "email"]],
		]);
	});

	it("a tab of an area they can't see is disabled, saying why; the others stay links", () => {
		const tabs = pageTabs(routes, "email", see);
		assert.deepEqual(tabs.map((tab) => [tab.id, Boolean(tab.disabled)]), [["emails", false], ["sent", false], ["people", true]]);
		assert.match(tabs[2]?.reason || "", /Ask an owner/);
	});

	it("a path's area is its tab's own, else its page's", () => {
		const page = (id: string) => routes.flatMap((row) => row.children || [row]).find((row) => row.id === id) || null;
		assert.equal(areaOfPath(page("email"), "/email/people"), "email-people");
		assert.equal(areaOfPath(page("email"), "/email/sent"), "email");
		assert.equal(areaOfPath(page("stock"), "/suppliers"), "stock");
		assert.equal(areaOfPath(null, "/"), undefined);
	});
});

describe("visibleRoutes", () => {
	it("hides developer tools from non-admins", () => {
		const ids = (list: typeof routes) =>
			list.find((row) => row.id === "settings")?.children?.map((row) => row.id);
		assert.deepEqual(ids(visibleRoutes(routes, false)), ["venue", "users", "lightspeed", "config"]);
		assert.deepEqual(ids(visibleRoutes(routes, true)), ["venue", "users", "lightspeed", "config", "dev-tools"]);
	});
});
