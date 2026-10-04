import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { addPlacement, isRepeatPlacement, placementChoices } from "./placement-add.ts";
import type { MenuPlacement, PosMenu } from "./types.ts";

const menus = [
	{ id: "1", name: "Fall 2026", isDefault: true },
	{ id: "2", name: "Brunch" },
] as PosMenu[];

describe("placementChoices", () => {
	it("always offers every kind, the default menu marked", () => {
		assert.deepEqual(placementChoices(menus).map((c) => c.value), ["print", "digital", "pos:1", "pos:2"]);
		assert.deepEqual(placementChoices(menus).map((c) => c.label), [
			"Print",
			"Digital",
			"POS · Fall 2026 (default)",
			"POS · Brunch",
		]);
		assert.deepEqual(placementChoices([]).map((c) => c.value), ["print", "digital"]);
	});
});

describe("addPlacement", () => {
	const defaults = { sectionId: "s1", screen: "Signature Cocktails" };

	it("starts print and digital in the drink's chapter, POS on the usual screen", () => {
		assert.deepEqual(addPlacement([], "digital", menus, defaults), [{ channel: "digital", sectionId: "s1" }]);
		assert.deepEqual(addPlacement([], "pos:2", menus, defaults), [
			{ channel: "pos", posMenuId: "2", posMenuName: "Brunch", posScreen: "Signature Cocktails" },
		]);
	});

	it("adds another row of a kind the drink already has", () => {
		assert.deepEqual(addPlacement([{ channel: "print", sectionId: "s0" }], "print", menus, defaults), [
			{ channel: "print", sectionId: "s0" },
			{ channel: "print", sectionId: "s1" },
		]);
		const pos = addPlacement(addPlacement([], "pos:1", menus, defaults), "pos:1", menus, defaults);
		assert.equal(pos.length, 2);
		assert.ok(pos.every((row) => row.channel === "pos" && row.posMenuId === "1"));
	});

	it("starts a second row somewhere free when it can", () => {
		const lists = { ...defaults, sectionIds: ["s1", "s2"], screens: ["Signature Cocktails", "Spritz"] };
		const print = addPlacement([{ channel: "print", sectionId: "s1" }], "print", menus, lists);
		assert.equal(print[1]?.sectionId, "s2");
		// Digital in s1 doesn't take s1 from Print.
		assert.equal(addPlacement([{ channel: "digital", sectionId: "s1" }], "print", menus, lists)[1]?.sectionId, "s1");
		const pos = addPlacement(addPlacement([], "pos:1", menus, lists), "pos:1", menus, lists);
		assert.deepEqual(pos.map((row) => row.posScreen), ["Signature Cocktails", "Spritz"]);
		// Another menu can use the same screen.
		assert.equal(addPlacement(pos, "pos:2", menus, lists)[2]?.posScreen, "Signature Cocktails");
		// Nowhere free: the default, flagged as a repeat in the table.
		const full = addPlacement(print, "print", menus, lists);
		assert.equal(full[2]?.sectionId, "s1");
		assert.equal(isRepeatPlacement(full, 2), true);
	});

	it("changes nothing it can't place", () => {
		assert.deepEqual(addPlacement([], "print", menus, { sectionId: "", screen: "" }), []);
		assert.deepEqual(addPlacement([], "pos:9", menus, defaults), []);
	});
});

describe("isRepeatPlacement", () => {
	it("flags a row that matches one above it, not the first of the pair", () => {
		const rows: MenuPlacement[] = [
			{ channel: "print", sectionId: "s1" },
			{ channel: "digital", sectionId: "s1" },
			{ channel: "print", sectionId: "s1" },
			{ channel: "pos", posMenuId: "1", posScreen: "Spritz" },
			{ channel: "pos", posMenuId: "1", posScreen: "Spritz/" },
			{ channel: "pos", posMenuId: "2", posScreen: "Spritz" },
		];
		assert.deepEqual(
			rows.map((_, i) => isRepeatPlacement(rows, i)),
			[false, false, true, false, true, false],
		);
	});
});
