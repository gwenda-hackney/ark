import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	formatPublishDiff,
	groupItemsForPublish,
	publishChangeCount,
	publishHint,
	publishLiveLabel,
	publishNeedsSync,
	publishNotLive,
	publishPendingCount,
	publishSyncLabel,
	type MenuItem,
} from "./types.ts";

function item(
	name: string,
	publish: MenuItem["publish"],
): MenuItem {
	return { name, publish };
}

describe("groupItemsForPublish", () => {
	it("splits drinks by the selected target", () => {
		const items = [
			item("Gwenda", {
				staging: { status: "unpublished", changed: ["price"] },
				production: { status: "unknown" },
			}),
			item("Negroni", {
				staging: { status: "published" },
				production: { status: "missing" },
			}),
			item("House lager", {
				staging: { status: "excluded" },
				production: { status: "excluded" },
			}),
		];
		const staging = groupItemsForPublish(items, "staging");
		assert.equal(staging.unpublished.length, 1);
		assert.equal(staging.unpublished[0].name, "Gwenda");
		assert.deepEqual(staging.unpublished[0].changed, ["price"]);
		assert.equal(staging.published.length, 1);
		assert.equal(staging.excluded.length, 1);
		assert.equal(staging.missing.length, 0);

		const live = groupItemsForPublish(items, "production");
		assert.equal(live.unknown.length, 1);
		assert.equal(live.missing[0].name, "Negroni");
	});
});

describe("publish labels", () => {
	it("treats a missing snapshot as on-site, not unpublished", () => {
		assert.equal(
			publishNeedsSync({
				staging: { status: "unknown" },
				production: { status: "unknown" },
			}),
			false,
		);
		assert.equal(
			publishHint({
				staging: { status: "unknown" },
				production: { status: "unknown" },
			}),
			"Preview site: no recorded snapshot yet. Live website: no recorded snapshot yet.",
		);
	});

	it("summarises unpublished changes as a count, not a split cell", () => {
		const publish = {
			staging: { status: "unpublished" as const, changed: ["price", "notes"] },
			production: { status: "published" as const },
		};
		assert.equal(publishNeedsSync(publish), true);
		assert.equal(publishNotLive(publish), false);
		assert.equal(publishChangeCount(publish), 2);
		assert.equal(publishSyncLabel(publish), "2 unpublished changes");
		assert.equal(publishLiveLabel(publish), "Live on the website");
		assert.equal(
			publishHint(publish),
			"Preview site: unpublished (price, style). Live website: up to date.",
		);
	});

	it("marks a drink not live when the live website is behind", () => {
		assert.equal(
			publishNotLive({
				staging: { status: "published" },
				production: { status: "unpublished", changed: ["price"] },
			}),
			true,
		);
		assert.equal(
			publishLiveLabel({
				staging: { status: "published" },
				production: { status: "unpublished", changed: ["price"] },
			}),
			"Not live · price",
		);
		assert.equal(
			publishLiveLabel({
				staging: { status: "published" },
				production: { status: "missing" },
			}),
			"Not on the live website",
		);
	});

	it("counts drinks that still need a website update", () => {
		const items = [
			item("Gwenda", {
				staging: { status: "unknown" },
				production: { status: "unknown" },
			}),
			item("Negroni", {
				staging: { status: "unpublished", changed: ["price"] },
				production: { status: "published" },
			}),
			item("House lager", {
				staging: { status: "missing" },
				production: { status: "missing" },
			}),
		];
		assert.equal(publishPendingCount(items), 2);
		assert.equal(publishPendingCount(items, "staging"), 2);
		assert.equal(publishPendingCount(items, "production"), 1);
	});

	it("formats a field diff without dumping photo URLs", () => {
		assert.equal(
			formatPublishDiff({ field: "price", from: "14", to: "16" }),
			"14 to 16",
		);
		assert.equal(
			formatPublishDiff({ field: "notes", from: "", to: "Floral" }),
			"blank to Floral",
		);
		assert.equal(
			formatPublishDiff({
				field: "photo",
				from: "https://files.baserow.io/a.jpg",
				to: "https://files.baserow.io/b.jpg",
			}),
			"photo updated",
		);
	});
});
