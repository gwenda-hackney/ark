import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { MenuPageDraft, saveReport, type SavePort } from "./menu-page-draft.svelte";
import type { MenuInput, MenuItemChapter, MenuPageItem } from "./types";

const details: MenuInput = { name: "Chez Pickle", kind: "kitchen", startsOn: "", endsOn: "", days: [], popupSeriesId: "9" };

const item = (id: string, name: string, price: string, otherMenus: string[] = []): MenuPageItem => ({
	id,
	name,
	description: "",
	prices: [{ name: "", price }],
	drinkType: "",
	otherMenus,
});

/** Chez Pickle as it's saved: Burgers (with a Smash group), Sides, Dessert. */
function chezPickle(): MenuItemChapter[] {
	return [
		{
			sectionId: "1",
			title: "Burgers",
			subtitle: "",
			items: [item("10", "OG Burger", "14"), item("11", "Liberty Burger", "15", ["Brunch"])],
			groups: [{ sectionId: "4", title: "Smash", subtitle: "", items: [item("12", "Double Smash", "16")] }],
		},
		{ sectionId: "2", title: "Sides", subtitle: "Served hot", items: [item("20", "Fries", "6")], groups: [] },
		{ sectionId: "3", title: "Dessert", subtitle: "", items: [], groups: [] },
	];
}

function draft() {
	const page = new MenuPageDraft();
	page.load("7", details, chezPickle(), { "8": "Brunch" });
	return page;
}

const titles = (page: MenuPageDraft) => page.view.map((chapter) => chapter.title);
const items = (page: MenuPageDraft, chapter = 0) => page.view[chapter].items.map((entry) => [entry.name, entry.mark]);

/** A port that records each call, and fails the one `failOn` names. */
function recorder(failOn = "") {
	const calls: string[] = [];
	let next = 100;
	const step = (call: string) => {
		calls.push(call);
		if (failOn && call.startsWith(failOn)) throw new Error("The server said no.");
	};
	const port: SavePort = {
		async details(body) {
			step(`details ${body.name}`);
		},
		async createSection(body) {
			step(`createSection ${body.title} parent=${body.parentId} menu=${body.menuId}`);
			return String(next++);
		},
		async updateSection(id, body) {
			step(`updateSection ${id} ${JSON.stringify(body)}`);
		},
		async updateItem(id, edit) {
			step(`updateItem ${id} ${edit.name} ${edit.price}`);
		},
		async createItem(sectionId, edit) {
			step(`createItem ${edit.name} in ${sectionId}`);
			return String(next++);
		},
		async order(ids) {
			step(`order ${ids.join(",")}`);
		},
		async takeOff(id, here) {
			step(`takeOff ${id} here=${here.join(",")}`);
		},
		async removeSection(id) {
			step(`removeSection ${id}`);
		},
	};
	return { port, calls };
}

describe("MenuPageDraft: a menu's page where nothing is written until Save menu", () => {
	it("starts as saved, with nothing to save", () => {
		const page = draft();
		assert.deepEqual(titles(page), ["Burgers", "Sides", "Dessert"]);
		assert.equal(page.dirty, false);
		assert.deepEqual(page.plan(), []);
	});

	it("shows an item's edit at once, marked; back as it was is no change", () => {
		const page = draft();
		assert.deepEqual(page.quick("10"), { name: "OG Burger", description: "", price: "14" });
		page.editItem("10", { name: "OG Burger", description: "Smashed twice", price: "£14.50" });
		const og = page.view[0].items[0];
		assert.deepEqual([og.name, og.description, og.prices[0].price, og.mark], ["OG Burger", "Smashed twice", "14.50", "edited"]);
		assert.equal(page.dirty, true);
		page.editItem("10", { name: "OG Burger ", description: "", price: "14" });
		assert.equal(page.view[0].items[0].mark, "");
		assert.equal(page.dirty, false);
	});

	it("adds an item at the end of its section, marked new, and edits it there", () => {
		const page = draft();
		const id = page.addItem("2", { name: "Onion rings", description: "", price: "7" });
		assert.deepEqual(items(page, 1), [
			["Fries", ""],
			["Onion rings", "new"],
		]);
		page.editItem(id, { name: "Onion rings", description: "Beer batter", price: "7.5" });
		assert.deepEqual(page.quick(id), { name: "Onion rings", description: "Beer batter", price: "7.5" });
		page.takeOff(id);
		assert.deepEqual(items(page, 1), [["Fries", ""]], "a new item just goes");
		assert.equal(page.dirty, false);
	});

	it("takes an item off in plain sight, asks from what it loaded, and undoes", () => {
		const page = draft();
		assert.deepEqual(page.takeOffQuestion("10", "Chez Pickle"), {
			title: "Delete OG Burger?",
			message: "It isn't on any other menu, so it will be deleted, with its recipe, when you save.",
			action: "Delete",
		});
		assert.deepEqual(page.takeOffQuestion("11", "Chez Pickle"), {
			title: "Take Liberty Burger off Chez Pickle?",
			message: "It stays on Brunch. It comes off Chez Pickle when you save.",
			action: "Take off",
		});
		page.takeOff("11");
		assert.deepEqual(items(page), [
			["OG Burger", ""],
			["Liberty Burger", "off"],
		]);
		assert.deepEqual(page.plan().map((step) => step.kind), ["takeOff"]);
		page.undoTakeOff("11");
		assert.equal(page.dirty, false);
	});

	it("reorders sections, and a move back is no change", () => {
		const page = draft();
		page.setOrder("", ["2", "1", "3"]);
		assert.deepEqual(titles(page), ["Sides", "Burgers", "Dessert"]);
		assert.equal(page.dirty, true);
		page.setOrder("", ["1", "2", "3"]);
		assert.equal(page.dirty, false);
	});

	it("adds sections and groups at the end, renames them, and drops a new one with what's new in it", () => {
		const page = draft();
		const drinks = page.addSection("Drinks");
		const group = page.addSection("Softs", drinks);
		page.addItem(group, { name: "Cola", description: "", price: "3" });
		page.renameSection(drinks, "Drinks & softs");
		assert.deepEqual(titles(page), ["Burgers", "Sides", "Dessert", "Drinks & softs"]);
		assert.equal(page.view[3].mark, "new");
		assert.deepEqual(page.view[3].groups.map((entry) => [entry.title, entry.items.map((i) => i.name)]), [["Softs", ["Cola"]]]);
		page.removeSection(drinks);
		assert.deepEqual(titles(page), ["Burgers", "Sides", "Dessert"]);
		assert.equal(page.dirty, false);
	});

	it("renames a saved section and its line, marked edited", () => {
		const page = draft();
		page.renameSection("2", "Sides & dips");
		page.setSubtitle("2", "");
		assert.deepEqual([page.view[1].title, page.view[1].subtitle, page.view[1].mark], ["Sides & dips", "", "edited"]);
		page.renameSection("2", "Sides");
		page.setSubtitle("2", "Served hot");
		assert.equal(page.dirty, false);
	});

	it("marks a saved section removed or moved, still shown, and undoes", () => {
		const page = draft();
		page.removeSection("2");
		page.moveToMenu("3", "8");
		assert.deepEqual(
			page.view.map((chapter) => [chapter.title, chapter.mark, chapter.movedTo]),
			[
				["Burgers", "", ""],
				["Sides", "removed", ""],
				["Dessert", "moved", "Brunch"],
			],
		);
		page.undoRemoveSection("2");
		page.undoMove("3");
		assert.equal(page.dirty, false);
	});

	it("says what removing a section takes, from what it loaded", () => {
		const page = draft();
		assert.deepEqual(page.removalOf("1"), {
			title: "Burgers",
			groups: ["Smash"],
			deleted: ["OG Burger", "Double Smash"],
			takenOff: ["Liberty Burger"],
		});
		assert.deepEqual(page.removalOf("3"), { title: "Dessert", groups: [], deleted: [], takenOff: [] });
	});

	it("is dirty for the details too", () => {
		const page = draft();
		page.details.name = "Chez Pickle II";
		assert.equal(page.detailsDirty, true);
		assert.equal(page.dirty, true);
		assert.equal(page.itemsDirty, false);
	});

	it("plans Save menu in order: details, new sections (chapters first), section changes, items, order, then what comes off", () => {
		const page = draft();
		page.details.name = "Chez Pickle II";
		page.takeOff("11");
		page.removeSection("3");
		const drinks = page.addSection("Drinks");
		const softs = page.addSection("Softs", drinks);
		page.addItem(softs, { name: "Cola", description: "", price: "3" });
		page.editItem("10", { name: "OG", description: "", price: "14" });
		page.renameSection("2", "Sides & dips");
		page.moveToMenu("1", "8");
		page.setOrder("", ["2", drinks, "1", "3"]);
		assert.deepEqual(
			page.plan().map((step) => step.kind),
			["details", "createSection", "createSection", "updateSection", "updateSection", "updateItem", "createItem", "order", "takeOff", "removeSection"],
		);
		const order = page.plan().find((step) => step.kind === "order");
		assert.deepEqual(order && "ids" in order ? order.ids : [], ["2", drinks, "3"], "a chapter moving to another menu isn't in this one's order");
	});

	it("leaves out what goes with a removed section", () => {
		const page = draft();
		const group = page.addSection("Veggie", "1");
		page.addItem("4", { name: "Halloumi", description: "", price: "13" });
		page.renameSection("4", "Smashed");
		page.removeSection("1");
		assert.deepEqual(page.plan().map((step) => step.kind), ["removeSection"]);
		assert.ok(group);
	});

	it("saves through the port in order, new ids where they're needed, and is clean after", async () => {
		const page = draft();
		const drinks = page.addSection("Drinks");
		const softs = page.addSection("Softs", drinks);
		page.addItem(softs, { name: "Cola", description: "", price: "3" });
		page.editItem("20", { name: "Fries", description: "", price: "6.50" });
		page.setOrder("", [drinks, "1", "2", "3"]);
		page.takeOff("10");
		const { port, calls } = recorder();
		const result = await page.save(port);
		assert.deepEqual(calls, [
			"createSection Drinks parent= menu=7",
			"createSection Softs parent=100 menu=7",
			"updateItem 20 Fries 6.50",
			"createItem Cola in 101",
			"order 100,1,2,3",
			"takeOff 10 here=1,4,2,3",
		]);
		assert.equal(result.failed, null);
		const after = chezPickle();
		after[0].items.shift();
		after[1].items[0].prices = [{ name: "", price: "6.50" }];
		after.unshift({ sectionId: "100", title: "Drinks", subtitle: "", items: [], groups: [{ sectionId: "101", title: "Softs", subtitle: "", items: [item("102", "Cola", "3")] }] });
		page.settle(result, details, after);
		assert.equal(page.dirty, false);
		assert.deepEqual(titles(page), ["Drinks", "Burgers", "Sides", "Dessert"]);
	});

	it("stops at a step that fails, says what was saved and what wasn't, and keeps the rest", async () => {
		const page = draft();
		const drinks = page.addSection("Drinks");
		page.addItem(drinks, { name: "Cola", description: "", price: "3" });
		page.editItem("20", { name: "Fries", description: "", price: "7" });
		page.takeOff("10");
		const { port, calls } = recorder("createItem");
		const result = await page.save(port);
		assert.deepEqual(calls, ["createSection Drinks parent= menu=7", "updateItem 20 Fries 7", "createItem Cola in 100"]);
		assert.equal(result.failed?.step.kind, "createItem");
		assert.equal(
			saveReport(result),
			"Saved new section Drinks and changes to Fries. Couldn't save new item Cola: The server said no. Not saved yet: new item Cola and taking OG Burger off; it's all still here to save.",
		);
		const after = chezPickle();
		after[1].items[0].prices = [{ name: "", price: "7" }];
		after.push({ sectionId: "100", title: "Drinks", subtitle: "", items: [], groups: [] });
		page.settle(result, details, after);
		assert.equal(page.dirty, true);
		assert.deepEqual(page.view[3].items.map((entry) => [entry.name, entry.mark]), [["Cola", "new"]], "the new item waits in the saved section");
		assert.deepEqual(page.view[1].items.map((entry) => entry.mark), [""], "Fries is saved");
		assert.deepEqual(page.view[0].items.map((entry) => entry.mark), ["off", ""], "OG Burger still to come off");
		assert.deepEqual(
			page.plan().map((step) => [step.kind, "sectionId" in step ? step.sectionId : ""]),
			[
				["createItem", "100"],
				["takeOff", ""],
			],
		);
	});
});
