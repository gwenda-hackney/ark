import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { OpsGalleryPhoto } from "../app/api";
import { galleryTiles, uploadedMessage } from "./gallery-photos";

const photo = (key: string, width: number, height: number, fields: Partial<OpsGalleryPhoto> = {}): OpsGalleryPhoto => ({
	key,
	asset: `image-${"a".repeat(40)}-${width}x${height}-jpg`,
	url: `https://cdn.sanity.io/images/p/production/${key}-${width}x${height}.jpg`,
	width,
	height,
	date: "",
	added: "2026-11-10T20:00:00.000Z",
	source: "ops",
	...fields,
});

const TOO_SMALL =
	"240 × 240. The Photos page needs 800 px on the long side, so it's left out there. " +
	"It still shows on the event's own page while the event has nights to come.";

describe("Images tab: a photo too small for the Photos page", () => {
	it("badges a 240 × 240 photo, saying in plain words why it's not on the Photos page", () => {
		const [tile] = galleryTiles([photo("a", 240, 240)]);
		assert.deepEqual(tile, {
			key: "a",
			name: "Photo",
			thumb: "https://cdn.sanity.io/images/p/production/a-240x240.jpg?w=400&h=400&fit=crop&auto=format",
			full: "https://cdn.sanity.io/images/p/production/a-240x240.jpg",
			small: TOO_SMALL,
		});
	});

	it("doesn't badge one 800 px on its long side, either way up", () => {
		const tiles = galleryTiles([photo("a", 800, 600), photo("b", 600, 800, { date: "2026-10-02" })]);
		assert.deepEqual(
			tiles.map((tile) => [tile.name, tile.small]),
			[
				["Photo", ""],
				["Photo from 2026-10-02", ""],
			],
		);
	});

	it("says so when an uploaded photo is too small, in one line", () => {
		assert.equal(
			uploadedMessage(1, [photo("a", 240, 240)]),
			"Image uploaded. It's 240 × 240, too small for the Photos page (it needs 800 px).",
		);
		assert.equal(
			uploadedMessage(3, [photo("a", 1600, 1200), photo("b", 240, 240), photo("c", 800, 600)]),
			"3 images uploaded. One is 240 × 240, too small for the Photos page (it needs 800 px).",
		);
		assert.equal(
			uploadedMessage(3, [photo("a", 240, 240), photo("b", 300, 400), photo("c", 800, 600)]),
			"3 images uploaded. 2 are too small for the Photos page (it needs 800 px).",
		);
	});

	it("says just that it's uploaded when it's big enough, or was there already", () => {
		assert.equal(uploadedMessage(1, [photo("a", 800, 600)]), "Image uploaded.");
		assert.equal(uploadedMessage(2, [photo("a", 1600, 1200), photo("b", 900, 1200)]), "2 images uploaded.");
		assert.equal(uploadedMessage(1, []), "Image uploaded.");
	});
});
