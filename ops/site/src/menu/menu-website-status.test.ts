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

	it("has nothing to do when the website shows the menu, or it's on its way", () => {
		assert.deepEqual(status({}), {
			badge: { label: "On the website", tone: "success", title: "The website shows this menu as saved." },
			disabled: true,
			reason: "The website already shows this menu",
		});
		const sent = status({ site: { waiting: true, updating: false, failed: false } });
		assert.deepEqual([sent.badge?.label, sent.disabled, sent.reason], ["Waiting for the website", true, "It's on its way to the website"]);
		assert.equal(status({ site: { waiting: true, updating: true, failed: false } }).badge?.label, "Updating the website");
		assert.equal(status({ site: { waiting: true, updating: false, failed: true } }).badge?.tone, "danger");
	});

	it("waits while it asks, and lets it be pressed when asking failed", () => {
		assert.deepEqual(status({ changes: null, checking: true }), { badge: null, disabled: true, reason: "Checking the website…" });
		assert.deepEqual(status({ changes: null, checking: false }), { badge: null, disabled: false });
	});
});

describe("menuSiteBuild", () => {
	it("is waiting only for menu documents", () => {
		const item = (type: string, kind = "document") => ({ type, kind });
		assert.deepEqual(menuSiteBuild(null), { waiting: false, updating: false, failed: false });
		assert.equal(menuSiteBuild({ items: [item("eventSeries")], updating: true, failed: false }).waiting, false);
		assert.deepEqual(menuSiteBuild({ items: [item("menuItem")], updating: true, failed: false }), { waiting: true, updating: true, failed: false });
		assert.equal(menuSiteBuild({ items: [item("menus", "menus")], updating: false, failed: false }).waiting, true);
	});
});
