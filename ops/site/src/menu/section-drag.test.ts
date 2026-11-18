import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { dropIndex, orderAfterDrop } from "./section-drag";

const box = (top: number, height = 50) => ({ top, bottom: top + height });

describe("dropIndex: where a dragged section would land", () => {
	it("in the column: before the one whose upper half it's over, after the last when below them all", () => {
		const column = [box(0), box(60), box(120)];
		assert.equal(dropIndex(-5, column), 0);
		assert.equal(dropIndex(10, column), 0);
		assert.equal(dropIndex(40, column), 1, "lower half of the first: after it");
		assert.equal(dropIndex(55, column), 1, "in the gap");
		assert.equal(dropIndex(130, column), 2);
		assert.equal(dropIndex(400, column), 3);
	});
});

describe("orderAfterDrop", () => {
	it("moves the dragged one before the index it lands at", () => {
		assert.deepEqual(orderAfterDrop(["a", "b", "c"], 0, 3), ["b", "c", "a"]);
		assert.deepEqual(orderAfterDrop(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
		assert.deepEqual(orderAfterDrop(["a", "b", "c"], 0, 2), ["b", "a", "c"]);
	});
});
