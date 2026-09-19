import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDraftDirty, serializeMenuDraft } from "./draft-history.ts";
import type { MenuItem } from "./types.ts";

const base: MenuItem = {
	name: "Ambra",
	sectionId: "3",
	drinkType: "cocktail",
	description: "cognac, banana, tonka, lemon, orange bitters",
	ingredients: [],
};

describe("serializeMenuDraft", () => {
	it("treats an AI reading as an unsaved change", () => {
		const clean = serializeMenuDraft(base);
		const dirty = serializeMenuDraft({
			...base,
			analysisNote: {
				summary: "Cognac sour with banana and tonka.",
				concerns: [],
				questions: [],
				specKey: "k1",
			},
		});
		assert.equal(isDraftDirty(clean, dirty), true);
	});

	it("does not dirty an unchanged stored reading", () => {
		const withNote: MenuItem = {
			...base,
			analysisNote: {
				summary: "Cognac sour with banana and tonka.",
				concerns: [],
				questions: [],
				specKey: "k1",
			},
		};
		const snap = serializeMenuDraft(withNote);
		assert.equal(isDraftDirty(snap, serializeMenuDraft(withNote)), false);
	});
});
