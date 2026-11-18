import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { InlineItemEditor, itemDraftProblem } from "./item-inline-edit.svelte";

const fries = { kind: "item" as const, id: "1", label: "Fries" };
const slaw = { kind: "item" as const, id: "2", label: "Slaw" };
const friesDraft = { name: "Fries", description: "Rosemary salt", price: "6" };

describe("InlineItemEditor: an item edited where it sits on a menu's page", () => {
	it("opens an item with what it says, and only one at a time", async () => {
		const editor = new InlineItemEditor(async () => true);
		assert.equal(await editor.open(fries, friesDraft), true);
		assert.equal(editor.isOpen("1"), true);
		assert.deepEqual(editor.draft, friesDraft);
		assert.equal(editor.dirty, false);
		await editor.open(slaw, { name: "Slaw", description: "", price: "4" });
		assert.equal(editor.isOpen("1"), false, "opening another closes the first");
		assert.equal(editor.isOpen("2"), true);
	});

	it("asks before another opens over changes, and keeps them when told to", async () => {
		const asked: string[] = [];
		let answer = false;
		const editor = new InlineItemEditor(async (label) => {
			asked.push(label);
			return answer;
		});
		await editor.open(fries, friesDraft);
		editor.draft.name = "Skin-on fries";
		assert.equal(editor.dirty, true);
		assert.equal(await editor.open(slaw, { name: "Slaw", description: "", price: "" }), false);
		assert.deepEqual(asked, ["Fries"]);
		assert.equal(editor.isOpen("1"), true, "Fries stays open with its changes");
		assert.equal(editor.draft.name, "Skin-on fries");
		answer = true;
		assert.equal(await editor.open(slaw, { name: "Slaw", description: "", price: "" }), true);
		assert.equal(editor.isOpen("2"), true);
	});

	it("Cancel (or Esc) closes it as it was", async () => {
		const editor = new InlineItemEditor(async () => true);
		await editor.open(fries, friesDraft);
		editor.draft.price = "7";
		editor.cancel();
		assert.equal(editor.target, null);
		assert.equal(editor.dirty, false);
		await editor.open(fries, friesDraft);
		assert.equal(editor.draft.price, "6", "reopened, it says what the item says");
	});

	it("saves through the page's save path and closes; a bad draft stays open with the problem", async () => {
		const saved: unknown[] = [];
		const editor = new InlineItemEditor(async () => true);
		await editor.open(fries, friesDraft);
		editor.draft.price = "six";
		assert.equal(await editor.save(async (...args) => void saved.push(args)), "The price isn't a number.");
		assert.equal(editor.isOpen("1"), true);
		editor.draft.price = "£6.50";
		assert.equal(await editor.save(async (target, draft) => void saved.push([target, draft])), "");
		assert.deepEqual(saved, [[fries, { ...friesDraft, price: "£6.50" }]]);
		assert.equal(editor.target, null);
	});

	it("a failed save keeps what was typed", async () => {
		const editor = new InlineItemEditor(async () => true);
		await editor.open({ kind: "new", sectionId: "s1", label: "a new item" });
		assert.equal(editor.isAdding("s1"), true);
		editor.draft.name = "Onion rings";
		await assert.rejects(
			editor.save(async () => {
				throw new Error("offline");
			}),
			/offline/,
		);
		assert.equal(editor.isAdding("s1"), true);
		assert.equal(editor.draft.name, "Onion rings");
		assert.equal(editor.saving, false);
	});

	it("needs a name, and a price that is a number", () => {
		assert.equal(itemDraftProblem({ name: " ", description: "", price: "" }), "Give it a name.");
		assert.equal(itemDraftProblem({ name: "Fries", description: "", price: "" }), "");
		assert.equal(itemDraftProblem({ name: "Fries", description: "", price: "abc" }), "The price isn't a number.");
	});
});
