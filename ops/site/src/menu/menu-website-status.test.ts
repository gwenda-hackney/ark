import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { menuSiteBuild, menuWebsiteStatus } from "./menu-website-status";

const idle = { waiting: false, updating: false, failed: false };
const status = (over: Partial<Parameters<typeof menuWebsiteStatus>[0]>) =>
	menuWebsiteStatus({ menuId: "2", dirty: false, changes: { menus: {}, other: 0 }, checking: false, site: idle, ...over });

describe("menuWebsiteStatus: a menu's Update website and what it says beside it", () => {
	it("offers Update website when saved changes aren't on the website", () => {
		const now = status({ changes: { menus: { 2: 3, 1: 1 }, other: 0 } });
		assert.equal(now.badge?.label, "Not on the website yet");
		assert.equal(now.disabled, false);
		assert.equal(status({ changes: { menus: { 1: 1 }, other: 1 } }).disabled, false, "a change for every menu counts");
	});

	it("asks to save first while the page has changes, whatever the website shows", () => {
		assert.deepEqual(
			[status({ dirty: true, changes: { menus: { 2: 1 }, other: 0 } })].map(({ disabled, reason }) => [disabled, reason]),
			[[true, "Save the menu first"]],
		);
		assert.equal(status({ dirty: true }).reason, "Save the menu first");
	});

	it("has nothing to do when the website shows the menu, or it's being built", () => {
		assert.deepEqual(status({}), {
			badge: { label: "On the website", tone: "success", title: "The website shows this menu as saved." },
			disabled: true,
			reason: "The website already shows this menu",
		});
		const building = status({ site: { waiting: true, updating: true, failed: false } });
		assert.deepEqual([building.badge?.label, building.disabled, building.reason], ["Updating the website", true, "It's on its way to the website"]);
	});

	it("after a save, says it goes on the website by itself, and Update website does it now", () => {
		const saved = status({ changes: { menus: {}, other: 0, follows: true }, site: { waiting: true, updating: false, failed: false } });
		assert.deepEqual([saved.badge?.label, saved.disabled], ["Goes on the website by itself", false]);
		const sent = status({ changes: { menus: {}, other: 0, follows: false }, site: { waiting: true, updating: false, failed: false } });
		assert.equal(sent.badge?.label, "Waiting for the website");
		assert.equal(status({ changes: { menus: { 2: 1 }, other: 0, follows: false } }).badge?.label, "Not on the website yet", "saves wait for Update website");
		const failed = status({ site: { waiting: true, updating: false, failed: true } });
		assert.deepEqual([failed.badge?.tone, failed.disabled], ["danger", false]);
	});

	it("is honest that nothing builds by itself while local ops runs", () => {
		const paused = status({ site: { waiting: true, updating: false, failed: false, paused: true } });
		assert.deepEqual([paused.badge?.label, paused.disabled], ["Waits while local ops runs", false]);
	});

	it("waits while it asks, and lets it be pressed when asking failed", () => {
		assert.deepEqual(status({ changes: null, checking: true }), { badge: null, disabled: true, reason: "Checking the website…" });
		assert.deepEqual(status({ changes: null, checking: false }), { badge: null, disabled: false });
	});
});

describe("menuSiteBuild", () => {
	it("is waiting only for menu documents", () => {
		const item = (type: string, kind = "document") => ({ type, kind });
		assert.deepEqual(menuSiteBuild(null), { waiting: false, updating: false, failed: false, paused: false });
		assert.equal(menuSiteBuild({ items: [item("eventSeries")], updating: true, failed: false }).waiting, false);
		assert.deepEqual(menuSiteBuild({ items: [item("menuItem")], updating: true, failed: false }), { waiting: true, updating: true, failed: false, paused: false });
		assert.equal(menuSiteBuild({ items: [item("menu")], updating: false, failed: false, paused: { since: "", by: "" } }).paused, true);
		assert.equal(menuSiteBuild({ items: [item("menus", "menus")], updating: false, failed: false }).waiting, true);
	});
});
