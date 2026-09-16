import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keepFullWidthGroupsTogether } from "./grid-groups.ts";

function node(
	data: {
		_kind?: string;
		_id?: string;
		sectionId?: string;
		_sectionOrder?: number;
		name?: string;
	},
) {
	return { data };
}

describe("keepFullWidthGroupsTogether", () => {
	it("keeps section headers with their items after a global sort", () => {
		const highballs = node({
			_kind: "group",
			_id: "section:highballs",
			_sectionOrder: 0,
		});
		const cocktails = node({
			_kind: "group",
			_id: "section:cocktails",
			_sectionOrder: 1,
		});
		const soda = node({
			_kind: "item",
			_id: "soda",
			sectionId: "highballs",
			_sectionOrder: 0,
			name: "Soda",
		});
		const gin = node({
			_kind: "item",
			_id: "gin",
			sectionId: "cocktails",
			_sectionOrder: 1,
			name: "Gin",
		});
		const tonic = node({
			_kind: "item",
			_id: "tonic",
			sectionId: "highballs",
			_sectionOrder: 0,
			name: "Tonic",
		});
		const negroni = node({
			_kind: "item",
			_id: "negroni",
			sectionId: "cocktails",
			_sectionOrder: 1,
			name: "Negroni",
		});

		// Column sort puts empty group rows first, then items A–Z globally.
		const nodes = [highballs, cocktails, gin, negroni, soda, tonic];
		keepFullWidthGroupsTogether(nodes);

		assert.deepEqual(
			nodes.map((row) => row.data?._id),
			[
				"section:highballs",
				"soda",
				"tonic",
				"section:cocktails",
				"gin",
				"negroni",
			],
		);
	});

	it("preserves item order from the incoming sort within each group", () => {
		const header = node({
			_kind: "group",
			_id: "section:cocktails",
			_sectionOrder: 0,
		});
		const b = node({
			_kind: "item",
			_id: "b",
			sectionId: "cocktails",
			_sectionOrder: 0,
		});
		const a = node({
			_kind: "item",
			_id: "a",
			sectionId: "cocktails",
			_sectionOrder: 0,
		});

		const nodes = [header, b, a];
		keepFullWidthGroupsTogether(nodes);
		assert.deepEqual(
			nodes.map((row) => row.data?._id),
			["section:cocktails", "b", "a"],
		);
	});
});
