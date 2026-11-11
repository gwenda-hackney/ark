import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { CATEGORY_CHOICES, CATEGORY_FILTER_ITEMS, categoryBadge, categoryOf, filterByCategory } from "./event-category";

const events = [
	{ name: "Jazz Night" },
	{ name: "Quiz", category: "event" },
	{ name: "Happy Hour", category: "promotion" },
	{ name: "Chez Pickle", category: "popup" },
];

describe("event categories", () => {
	it("a series with none is a night", () => {
		assert.equal(categoryOf(events[0]), "event");
		assert.equal(categoryOf({ category: "party" }), "event");
		assert.equal(categoryOf(events[2]), "promotion");
	});

	it("the list keeps promotions and pop-up kitchens apart from nights", () => {
		const names = (filter: Parameters<typeof filterByCategory>[1]) =>
			filterByCategory(events, filter).map((event) => event.name);
		assert.deepEqual(names("all"), ["Jazz Night", "Quiz", "Happy Hour", "Chez Pickle"]);
		assert.deepEqual(names("event"), ["Jazz Night", "Quiz"]);
		assert.deepEqual(names("promotion"), ["Happy Hour"]);
		assert.deepEqual(names("popup"), ["Chez Pickle"]);
	});

	it("uses plain words", () => {
		assert.deepEqual(
			CATEGORY_CHOICES.map((choice) => choice.label),
			["A night", "A promotion", "A pop-up kitchen"],
		);
		assert.deepEqual(
			CATEGORY_FILTER_ITEMS.map((item) => item.label),
			["All", "Nights", "Promotions", "Pop-up kitchens"],
		);
		assert.equal(categoryBadge(events[0]), "");
		assert.equal(categoryBadge(events[2]), "Promotion");
		assert.equal(categoryBadge(events[3]), "Pop-up kitchen");
	});
});
