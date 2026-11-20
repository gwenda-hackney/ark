import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { insertionIndex, movedTo } from "./drag-reorder";

const column = [0, 100, 200].map((top) => ({ top, left: 0, width: 300, height: 80 }));
// Two rows of two tiles.
const grid = [
	{ top: 0, left: 0, width: 100, height: 100 },
	{ top: 0, left: 120, width: 100, height: 100 },
	{ top: 120, left: 0, width: 100, height: 100 },
	{ top: 120, left: 120, width: 100, height: 100 },
];

describe("dragging into a new order", () => {
	it("down a column: before the first item whose middle is below the pointer; past the last, after it", () => {
		assert.equal(insertionIndex(column, 10, -50, "y"), 0, "above everything");
		assert.equal(insertionIndex(column, 10, 30, "y"), 0, "top half of the first");
		assert.equal(insertionIndex(column, 10, 50, "y"), 1, "bottom half of the first");
		assert.equal(insertionIndex(column, 10, 190, "y"), 2, "in a gap");
		assert.equal(insertionIndex(column, 10, 900, "y"), 3, "far below: last");
	});

	it("in a grid: by row, then left or right of a tile's middle", () => {
		assert.equal(insertionIndex(grid, 10, 50, "grid"), 0);
		assert.equal(insertionIndex(grid, 90, 50, "grid"), 1);
		assert.equal(insertionIndex(grid, 200, 50, "grid"), 2, "right half of the last in the row: before the next row");
		assert.equal(insertionIndex(grid, 150, 160, "grid"), 3);
		assert.equal(insertionIndex(grid, 500, 500, "grid"), 4, "past the end");
	});

	it("puts the item before `at`; dropping on itself or just after leaves the list as it was", () => {
		const list = ["a", "b", "c", "d"];
		assert.deepEqual(movedTo(list, 0, 3), ["b", "c", "a", "d"]);
		assert.deepEqual(movedTo(list, 3, 0), ["d", "a", "b", "c"]);
		assert.deepEqual(movedTo(list, 1, 4), ["a", "c", "d", "b"]);
		assert.equal(movedTo(list, 2, 2), list);
		assert.equal(movedTo(list, 2, 3), list);
	});
});
