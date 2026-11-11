import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	CATEGORY_CHOICES,
	CATEGORY_FIELDS,
	CATEGORY_FILTER_ITEMS,
	categoryBadge,
	categoryOf,
	fieldsFor,
	filterByCategory,
	hiddenFields,
} from "./event-category";

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

describe("the fields each type asks for (#245)", () => {
	const { event: night, promotion: deal, popup } = CATEGORY_FIELDS;

	it("a night: a guest, a link for tickets, an offer and a running order, all optional; once", () => {
		assert.equal(night.artist.need, "optional");
		assert.equal(night.pageUrl.need, "optional");
		assert.equal(night.pageUrl.label, "Tickets, RSVP or Instagram");
		assert.equal(night.offer.need, "optional");
		assert.equal(night.nightSchedule, "optional");
		assert.equal(night.endTime, "optional");
		assert.equal(night.repeats, false);
	});

	it("a deal: the deal and when it ends, no guest, link or running order; it repeats", () => {
		assert.equal(deal.artist.need, "off");
		assert.equal(deal.pageUrl.need, "off");
		assert.deepEqual([deal.offer.need, deal.offer.label], ["required", "The deal"]);
		assert.equal(deal.nightSchedule, "off");
		assert.equal(deal.endTime, "required");
		assert.equal(deal.repeats, true);
		assert.equal(deal.namePlaceholder, "Happy Hour");
	});

	it("a pop-up kitchen: their link, no guest, offer or running order; once, or a run of days", () => {
		assert.equal(popup.artist.need, "off");
		assert.equal(popup.offer.need, "off");
		assert.deepEqual([popup.pageUrl.need, popup.pageUrl.label], ["optional", "Their Instagram or website"]);
		assert.equal(popup.nightSchedule, "off");
		assert.equal(popup.repeats, false);
		assert.deepEqual(popup.repeatsAs, { unit: "day", lastDay: true });
		assert.equal(popup.namePlaceholder, "The kitchen's name");
	});

	it("reads a saved series' type, and lists what a type doesn't ask for", () => {
		assert.equal(fieldsFor(events[0]), night, "one saved before types is a night");
		assert.equal(fieldsFor(events[3]), popup);
		assert.deepEqual(hiddenFields(events[0]), []);
		assert.deepEqual(hiddenFields(events[2]), ["artist", "pageUrl", "nightSchedule"]);
		assert.deepEqual(hiddenFields(events[3]), ["artist", "offer", "nightSchedule"]);
	});
});
