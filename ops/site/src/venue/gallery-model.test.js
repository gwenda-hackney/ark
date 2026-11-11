import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  DESCRIPTION_MAX_LENGTH,
  assertValidPhotoChanges,
  assertWholeOrder,
  galleryPhoto,
  galleryPhotoProblems,
  moveKey,
  newPhotoKey,
} from "./gallery-model.js";

const ASSET = `image-${"a".repeat(40)}-1600x1067-webp`;

describe("the venue's gallery: the rules", () => {
  it("a photo is a key and a Sanity image, its words tidied, its board one of the two", () => {
    assert.deepEqual(
      galleryPhoto({ key: " k1 ", asset: ASSET, description: "  The terrace\n at night ", menu: "Drinks", added: "t", addedBy: "o" }),
      { key: "k1", asset: ASSET, description: "The terrace at night", menu: "drinks", added: "t", addedBy: "o" },
    );
    assert.equal(galleryPhoto({ key: "k1", asset: ASSET, menu: "bar" }).menu, "");
    assert.equal(galleryPhoto({ key: "", asset: ASSET }), null);
    assert.equal(galleryPhoto({ key: "k1", asset: "photo.jpg" }), null);
    assert.match(newPhotoKey(), /^[0-9a-f]{16}$/);
  });

  it("says what's wrong with a photo's words, and takes what's right", () => {
    assert.deepEqual(galleryPhotoProblems({ description: "Fine", menu: "food" }), {});
    assert.deepEqual(Object.keys(galleryPhotoProblems({ description: "x".repeat(DESCRIPTION_MAX_LENGTH + 1), menu: "bar" })), [
      "description",
      "menu",
    ]);
    assert.deepEqual(assertValidPhotoChanges({ description: " A spritz ", menu: "none" }), { description: "A spritz", menu: "" });
    assert.deepEqual(assertValidPhotoChanges({ menu: "food" }), { menu: "food" });
    assert.throws(
      () => assertValidPhotoChanges({ menu: "bar" }),
      (error) => error.status === 400 && /^Menu board: /.test(error.message) && Boolean(error.problems.menu),
    );
  });

  it("a new order is every photo once, or the page was out of date", () => {
    assert.deepEqual(assertWholeOrder(["a", "b"], ["b", "a"]), ["b", "a"]);
    for (const order of [["a"], ["a", "a"], ["a", "c"], "a,b", null]) {
      assert.throws(() => assertWholeOrder(["a", "b"], order), (error) => error.status === 409);
    }
  });

  it("moves one key to a place, the rest in their order", () => {
    assert.deepEqual(moveKey(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
    assert.deepEqual(moveKey(["a", "b", "c"], "a", 9), ["b", "c", "a"]);
    assert.deepEqual(moveKey(["a", "b", "c"], "x", 0), ["a", "b", "c"]);
  });
});
