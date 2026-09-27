import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	HERO_ASPECT,
	cardFrameFromCrop,
	clampFrame,
	coverFrameSize,
} from "./hero-crops.ts";

describe("card frame", () => {
	it("keeps a 16×10 window inside a taller saved crop", () => {
		const width = 1170;
		const height = 2532;
		const crop = {
			left: 0,
			top: 0.15411376483040917,
			right: 0,
			bottom: 0.3800744326929053,
		};
		const hotspot = { x: 0.5, y: 0.38701966606875193, width: 0.2, height: 0.2 };
		const frame = cardFrameFromCrop(crop, width, height, hotspot);
		const pxW = (1 - frame.left - frame.right) * width;
		const pxH = (1 - frame.top - frame.bottom) * height;
		assert.ok(Math.abs(pxW / pxH - HERO_ASPECT) < 0.01);
		assert.ok(frame.top > crop.top);
		assert.ok(frame.bottom > crop.bottom);
	});

	it("does not stretch a frame past the photo", () => {
		const cover = coverFrameSize(1170, 2532);
		const frame = clampFrame(1170, 2532, 100, 100, cover.width, cover.height);
		assert.ok(frame.left >= 0);
		assert.ok(frame.top >= 0);
		assert.ok(frame.right >= -0.001);
		assert.ok(frame.bottom >= -0.001);
		const pxW = (1 - frame.left - frame.right) * 1170;
		const pxH = (1 - frame.top - frame.bottom) * 2532;
		assert.ok(Math.abs(pxW / pxH - HERO_ASPECT) < 0.01);
	});
});
