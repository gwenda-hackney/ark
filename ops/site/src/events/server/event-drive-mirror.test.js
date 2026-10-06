import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { desiredImages, mirrorPlan, mirrorSignature } from "./event-drive-mirror.js";

const A = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
const B = "image-ffeeddccbbaa99887766554433221100ffeeddcc-1200x800-png";

describe("the Drive copy", () => {
  const event = {
    name: "Jazz / Soul",
    driveFolderId: "f1",
    mainImage: { asset: A },
    dates: [{ date: "2026-10-08", overrides: { image: { asset: B } } }, { date: "2026-10-15", overrides: { image: null } }],
    gallery: [
      { key: "k1", asset: B, date: "", source: "ops" },
      { key: "d9", asset: A, date: "2026-10-08", source: "drive:d9" },
    ],
  };

  it("wants each photo once, named for people, with Drive originals to move in", () => {
    assert.deepEqual(desiredImages(event), [
      { tag: `hero::${A}`, asset: A, name: "hero - Jazz Soul.jpg" },
      { tag: `flyer:2026-10-08:${B}`, asset: B, name: "2026-10-08 flyer - Jazz Soul.png" },
      { tag: `gallery::${B}`, asset: B, name: "gallery - k1.png" },
      { tag: `gallery:2026-10-08:${A}`, asset: A, name: "gallery 2026-10-08 - d9.jpg", adopt: "d9" },
    ]);
  });

  it("copies what's missing and bins only tagged files no longer wanted", () => {
    const desired = desiredImages(event);
    const existing = [
      { id: "x1", appProperties: { opsImage: `hero::${A}` } },
      { id: "x2", appProperties: { opsImage: `gallery::${A}` } },
      { id: "by-hand" },
    ];
    const plan = mirrorPlan(desired, existing);
    assert.deepEqual(plan.copy.map((item) => item.tag), desired.slice(1).map((item) => item.tag));
    assert.deepEqual(plan.trash.map((file) => file.id), ["x2"]);
  });

  it("the signature changes with the folder or the photos, not their order", () => {
    const desired = desiredImages(event);
    assert.equal(mirrorSignature(event, desired), mirrorSignature(event, [...desired].reverse()));
    assert.notEqual(mirrorSignature(event, desired), mirrorSignature({ ...event, driveFolderId: "f2" }, desired));
    assert.notEqual(mirrorSignature(event, desired), mirrorSignature(event, desired.slice(1)));
  });
});
