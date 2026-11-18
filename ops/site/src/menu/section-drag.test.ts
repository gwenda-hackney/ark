import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { dropIndex, orderAfterDrop } from "./section-drag";

const box = (top: number, left = 0, width = 100, height = 50) => ({ top, bottom: top + height, left, right: left + width });

describe("dropIndex: where a dragged section would land", () => {
	it("in a column: before the one whose upper half it's over, after the last when below them all", () => {
		const column = [box(0), box(60), box(120)];
		assert.equal(dropIndex(10, -5, column), 0);
		assert.equal(dropIndex(10, 10, column), 0);
		assert.equal(dropIndex(10, 40, column), 1, "lower half of the first: after it");
		assert.equal(dropIndex(10, 55, column), 1, "in the gap");
		assert.equal(dropIndex(10, 130, column), 2);
		assert.equal(dropIndex(10, 400, column), 3);
	});

	it("side by side: left half before it, right half after it", () => {
		const grid = [box(0, 0), box(0, 110), box(60, 0)];
		assert.equal(dropIndex(20, 30, grid), 0);
		assert.equal(dropIndex(80, 30, grid), 1);
		assert.equal(dropIndex(190, 30, grid), 2);
		assert.equal(dropIndex(20, 70, grid), 2);
	});
});

describe("orderAfterDrop", () => {
	it("moves the dragged one before the index it lands at", () => {
		assert.deepEqual(orderAfterDrop(["a", "b", "c"], 0, 3), ["b", "c", "a"]);
		assert.deepEqual(orderAfterDrop(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
		assert.deepEqual(orderAfterDrop(["a", "b", "c"], 0, 2), ["b", "a", "c"]);
	});
});
