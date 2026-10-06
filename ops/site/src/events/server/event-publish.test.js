import assert from "node:assert/strict";
import { test } from "vitest";
import { withImageCrop } from "./event-publish.js";

test("whole image framing publishes the photo uncropped with fit: whole (#27)", () => {
  const image = { _type: "image", asset: { _ref: "image-a" }, crop: { left: 0.2 }, hotspot: { x: 0.5 } };
  assert.deepEqual(withImageCrop(image, { fit: "whole", crop: { left: 0, top: 0, right: 0, bottom: 0 } }), {
    _type: "image",
    asset: { _ref: "image-a" },
    fit: "whole",
  });
  const filled = withImageCrop({ _type: "image" }, { crop: { left: 0.1, top: 0, right: 0.1, bottom: 0 } });
  assert.equal(filled.fit, undefined);
  assert.equal(filled.crop.left, 0.1);
});
