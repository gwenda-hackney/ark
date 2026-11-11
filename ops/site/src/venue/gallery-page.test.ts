import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	changedMessage,
	droppedOrder,
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
		});
		assert.deepEqual([tiles[1].label, tiles[1].described, tiles[1].board, tiles[1].place], [
			"Not described yet",
			false,
			"",
			2,
		]);
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
