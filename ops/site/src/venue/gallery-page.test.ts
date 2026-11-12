import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	changedMessage,
	droppedOrder,
	eventSections,
	eventsOnPhotosPage,
	fromEventsFootnote,
	galleryFootnote,
	movedOrder,
	photoTiles,
	sameOrder,
	uploadedMessage,
} from "./gallery-page";
import { websiteBadge } from "./venue-page";
import type { VenuePhoto } from "./types";

const photo = (key: string, fields: Partial<VenuePhoto> = {}): VenuePhoto => ({
	key,
	asset: `image-${"a".repeat(40)}-800x600-jpg`,
	description: "",
	menu: "",
	added: "",
	addedBy: "",
	url: `https://cdn.sanity.io/images/p/production/${key}-800x600.jpg`,
	width: 800,
	height: 600,
	...fields,
});

describe("gallery page", () => {
	it("shows each photo as a square, in its place, nudging for words it hasn't got", () => {
		const tiles = photoTiles([photo("a", { description: "The terrace", menu: "drinks" }), photo("b")]);
		assert.deepEqual(tiles[0], {
			key: "a",
			thumb: "https://cdn.sanity.io/images/p/production/a-800x600.jpg?w=400&h=400&fit=crop&auto=format",
			full: "https://cdn.sanity.io/images/p/production/a-800x600.jpg",
			label: "The terrace",
			described: true,
			board: "Drinks board",
			place: 1,
			small: "",
		});
		assert.deepEqual([tiles[1].label, tiles[1].described, tiles[1].board, tiles[1].place], [
			"Not described yet",
			false,
			"",
			2,
		]);
	});

	it("badges a photo under 800 px on its long side: the website shows it, but it may look blurry", () => {
		const tiles = photoTiles([
			photo("a", { width: 240, height: 240 }),
			photo("b", { width: 600, height: 800 }),
			photo("c", { width: 799, height: 500 }),
		]);
		assert.deepEqual(
			tiles.map((tile) => tile.small),
			["Small: may look blurry on the website (under 800 px)", "", "Small: may look blurry on the website (under 800 px)"],
		);
	});

	it("a dragged photo takes the place of the one it's dropped on", () => {
		const keys = ["a", "b", "c", "d"];
		assert.deepEqual(droppedOrder(keys, "a", "c"), ["b", "c", "a", "d"]);
		assert.deepEqual(droppedOrder(keys, "d", "b"), ["a", "d", "b", "c"]);
		assert.deepEqual(droppedOrder(keys, "b", "b"), keys);
		assert.deepEqual(droppedOrder(keys, "x", "b"), keys);
	});

	it("moves a photo to the top, or one place up or down, never off the ends", () => {
		const keys = ["a", "b", "c"];
		assert.deepEqual(movedOrder(keys, "c", "top"), ["c", "a", "b"]);
		assert.deepEqual(movedOrder(keys, "b", "up"), ["b", "a", "c"]);
		assert.deepEqual(movedOrder(keys, "b", "down"), ["a", "c", "b"]);
		assert.deepEqual(movedOrder(keys, "a", "up"), keys);
		assert.deepEqual(movedOrder(keys, "c", "down"), keys);
		assert.equal(sameOrder(movedOrder(keys, "a", "top"), keys), true);
		assert.equal(sameOrder(movedOrder(keys, "b", "top"), keys), false);
	});

	it("says what a change did, and where the photos stand on the website", () => {
		assert.match(changedMessage("Saved", { published: true, website: "live" }), /^Saved\. Website pages follow/);
		assert.match(changedMessage("Moved", { published: false, website: "preview" }), /^Moved for the preview\./);
		assert.equal(changedMessage("Photo removed", { published: false, website: "unknown" }), "Photo removed in ops.");
		assert.equal(websiteBadge("behind", "photos").label, "Website shows other photos");
		assert.equal(websiteBadge("live", "photos").hint, "The website shows these photos.");
	});

	it("says what an upload did", () => {
		assert.equal(uploadedMessage(1, 1), "Photo added at the top. Open one to say what it shows.");
		assert.equal(uploadedMessage(2, 3), "2 photos added at the top (1 already there). Open one to say what it shows.");
		assert.equal(uploadedMessage(0, 1), "That photo's in the gallery already.");
		assert.equal(uploadedMessage(0, 2), "Those photos are in the gallery already.");
	});

	it("says how to move them, phones by opening one", () => {
		assert.equal(galleryFootnote(0, false), "No photos yet. Add some and they go on the website.");
		assert.match(galleryFootnote(1, false), /^1 photo\. Drag one/);
		assert.match(galleryFootnote(12, true), /^12 photos\. Open one/);
	});
});

describe("gallery page: from events", () => {
	const cdn = (key: string) => `https://cdn.sanity.io/images/p/production/${key}-1600x1200.jpg`;

	it("puts each event's photos under its name, linking to its Images tab, where they're managed", () => {
		const sections = eventSections([
			{
				id: "12",
				name: "Karaoke with Ross",
				photos: [{ key: "a", url: cdn("a"), width: 1600, height: 1200, added: "2026-11-08T22:00:00Z" }],
				more: 3,
				tooSmall: 0,
			},
			{ id: "7", name: "Chez Pickle", photos: [], more: 0, tooSmall: 0 },
		]);
		assert.deepEqual(sections[0], {
			id: "12",
			name: "Karaoke with Ross",
			href: "/events/12/gallery",
			tiles: [
				{
					key: "a",
					thumb: `${cdn("a")}?w=400&h=400&fit=crop&auto=format`,
					full: cdn("a"),
					label: "Karaoke with Ross, photo 1",
				},
			],
			more: "3 more on its Images tab",
			note: "",
		});
		assert.equal(sections[1].more, "");
		assert.equal(sections[1].href, "/events/7/gallery");
	});

	it("says under an event how many of its photos were left out as too small", () => {
		const photos = [{ key: "a", url: cdn("a"), width: 1600, height: 1200, added: "2026-11-08T22:00:00Z" }];
		const sections = eventSections([
			{ id: "12", name: "Karaoke with Ross", photos, more: 0, tooSmall: 2 },
			{ id: "9", name: "Quiz Night", photos, more: 0, tooSmall: 1 },
			{ id: "4", name: "Friday, With Guests", photos, more: 0, tooSmall: 0 },
		]);
		assert.deepEqual(
			sections.map((section) => section.note),
			["2 photos left out as too small (under 800 px).", "1 photo left out as too small (under 800 px).", ""],
		);
	});

	it("names an event left off the Photos page because its photos are too small", () => {
		const [section] = eventSections([{ id: "7", name: "Chez Pickle", photos: [], more: 0, tooSmall: 3 }]);
		assert.deepEqual([section.name, section.href, section.tiles, section.note], [
			"Chez Pickle",
			"/events/7/gallery",
			[],
			"Not on the Photos page: 3 photos too small (under 800 px).",
		]);
	});

	it("counts only the events on the Photos page in the line under them", () => {
		const photos = [{ key: "a", url: cdn("a"), width: 1600, height: 1200, added: "2026-11-08T22:00:00Z" }];
		const sections = eventSections([
			{ id: "12", name: "Karaoke with Ross", photos, more: 0, tooSmall: 0 },
			{ id: "7", name: "Chez Pickle", photos: [], more: 0, tooSmall: 3 },
		]);
		assert.equal(eventsOnPhotosPage(sections), 1);
	});

	it("says how many events the Photos page shows, or that there are none yet", () => {
		assert.equal(fromEventsFootnote(0), "No event photos on the website yet. Add some on an event's Images tab.");
		assert.equal(fromEventsFootnote(1), "1 event on the Photos page. Home's photo strip mixes in its newest photo.");
		assert.equal(
			fromEventsFootnote(5),
			"5 events on the Photos page, newest first. Home's photo strip mixes in a couple of their newest.",
		);
	});
});
