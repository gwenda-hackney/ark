import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { addPlacement, placementChoices } from "./placement-add.ts";
import type { PosMenu } from "./types.ts";

const menus = [
	{ id: "1", name: "Fall 2026", isDefault: true },
	{ id: "2", name: "Brunch" },
] as PosMenu[];

describe("placementChoices", () => {
	it("offers each channel once, and each POS menu once", () => {
		assert.deepEqual(
			placementChoices([{ channel: "print", sectionId: "s" }, { channel: "pos", posMenuId: "1" }], menus).map((c) => c.label),
			["Digital", "POS · Brunch"],
		);
		assert.deepEqual(placementChoices([], menus).map((c) => c.value), ["print", "digital", "pos:1", "pos:2"]);
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

	it("changes nothing it can't place", () => {
		assert.deepEqual(addPlacement([], "print", menus, { sectionId: "", screen: "" }), []);
		assert.deepEqual(addPlacement([], "pos:9", menus, defaults), []);
	});
});
