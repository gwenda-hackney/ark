import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { blankMenu, menuDraft, menuPayload, popupDraft, sameMenu } from "./menu-form";
import type { Menu } from "./types";

const pickle: Menu = {
	id: "2",
	name: "Chez Pickle",
	slug: "chez-pickle",
	kind: "kitchen",
	startsOn: "2026-11-12",
	endsOn: "2026-11-28",
	days: ["thu", "fri", "sat"],
	popupSeriesId: "41",
	popupName: "Chez Pickle",
	orderRank: 2,
	status: "on",
	statusLabel: "On now",
	datesLabel: "12–28 Nov",
	daysLabel: "Thu–Sat",
	itemCount: 8,
	chapterCount: 1,
};

describe("a menu's form", () => {
	it("starts a new menu as drinks, ongoing, every day", () => {
		assert.deepEqual(blankMenu(), { name: "", kind: "bar", startsOn: "", endsOn: "", days: [], popupSeriesId: "" });
	});

	it("starts a pop-up's menu from its name, nights and cooking days", () => {
		assert.deepEqual(
			popupDraft({ id: "41", name: "Chez Pickle", startsOn: "2026-11-12", endsOn: "", days: ["sat", "wed"] }),
			{ name: "Chez Pickle", kind: "kitchen", startsOn: "2026-11-12", endsOn: "", days: ["wed", "sat"], popupSeriesId: "41" },
		);
	});

	it("knows when nothing has changed, whatever order the days were picked in", () => {
		const draft = menuDraft(pickle);
		assert.ok(sameMenu(draft, { ...draft, days: ["sat", "thu", "fri"] }));
		assert.ok(sameMenu(draft, { ...draft, name: " Chez Pickle " }));
		assert.ok(!sameMenu(draft, { ...draft, days: ["sat"] }));
		assert.ok(!sameMenu(draft, { ...draft, endsOn: "" }));
	});

	it("sends no pop-up kitchen for drinks", () => {
		assert.equal(menuPayload({ ...menuDraft(pickle), kind: "bar" }).popupSeriesId, "");
		assert.equal(menuPayload(menuDraft(pickle)).popupSeriesId, "41");
	});
});
