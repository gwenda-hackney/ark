import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { GalleryResponse } from "../venue/types";
import { assetFromUrl, libraryOf } from "./picture-library";

const URL_A = "https://cdn.sanity.io/images/proj/production/aaa111-1600x1200.jpg";
const URL_B = "https://cdn.sanity.io/images/proj/production/bbb222-900x1200.png?w=800";

describe("the email's picture library", () => {
	it("a Sanity address is its asset id", () => {
		assert.equal(assetFromUrl(URL_A), "image-aaa111-1600x1200-jpg");
		assert.equal(assetFromUrl(URL_B), "image-bbb222-900x1200-png");
		assert.equal(assetFromUrl("https://example.com/a.jpg"), "");
	});

	it("the venue's pictures, then each event's, none twice, small copies for the grid", () => {
		const gallery = {
			photos: [{ key: "1", asset: "image-aaa111-1600x1200-jpg", description: "The bar", url: URL_A }],
			fromEvents: [
				{ id: "36", name: "Chez Pickle", photos: [{ key: "x", url: URL_A }, { key: "y", url: URL_B }], more: 0, tooSmall: 0 },
				{ id: "9", name: "Empty night", photos: [], more: 0, tooSmall: 0 },
			],
		} as unknown as GalleryResponse;
		const groups = libraryOf(gallery);
		assert.deepEqual(
			groups.map((group) => [group.title, group.pictures.map((picture) => [picture.assetId, picture.alt])]),
			[
				["Gwenda", [["image-aaa111-1600x1200-jpg", "The bar"]]],
				["Chez Pickle", [["image-bbb222-900x1200-png", "Chez Pickle"]]],
			],
		);
		assert.match(groups[1].pictures[0].thumb, /bbb222-900x1200\.png\?w=320&h=320&fit=crop/);
	});
});
