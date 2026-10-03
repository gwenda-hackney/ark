import { test } from "vitest";
import assert from "node:assert/strict";
import {
  galleryAssetFilename,
  galleryBehind,
  galleryEnabled,
  galleryFingerprint,
  syncGalleryImages,
} from "./event-gallery.js";

const files = [
  { id: "a", modifiedTime: "2026-09-26T10:00:00.000Z", mimeType: "image/jpeg" },
  { id: "b", modifiedTime: "2026-09-26T11:00:00.000Z", mimeType: "image/png" },
  { id: "c", modifiedTime: "2026-09-26T12:00:00.000Z", mimeType: "image/jpeg" },
];

function fakes(known = {}) {
  const uploaded = [];
  return {
    uploaded,
    options: {
      query: async () =>
        Object.entries(known).map(([originalFilename, _id]) => ({ _id, originalFilename })),
      download: async (_env, id) => ({ bytes: new ArrayBuffer(1), contentType: "image/jpeg", id }),
      upload: async (_env, _bytes, { filename }) => {
        uploaded.push(filename);
        return { _id: `image-${filename}`, originalFilename: filename };
      },
      rename: async () => {},
    },
  };
}

test("a gallery photo is named by its Drive id and edit time", () => {
  assert.equal(galleryAssetFilename(files[0]), "drive-a-20260926100000000");
  assert.notEqual(galleryFingerprint(files), galleryFingerprint(files.slice(1)));
});

test("photos already in Sanity are reused, new ones uploaded in Drive order", async () => {
  const { uploaded, options } = fakes({ [galleryAssetFilename(files[1])]: "image-known" });
  const { images, complete } = await syncGalleryImages({}, files, options);
  assert.equal(complete, true);
  assert.deepEqual(uploaded, [galleryAssetFilename(files[0]), galleryAssetFilename(files[2])]);
  assert.deepEqual(
    images.map((image) => [image._key, image.asset._ref]),
    [
      ["a", `image-${galleryAssetFilename(files[0])}`],
      ["b", "image-known"],
      ["c", `image-${galleryAssetFilename(files[2])}`],
    ],
  );
});

test("uploads stop at the cap and the rest wait for the next run", async () => {
  const { uploaded, options } = fakes();
  const { images, complete } = await syncGalleryImages({}, files, { ...options, maxUploads: 2 });
  assert.equal(complete, false);
  assert.equal(uploaded.length, 2);
  assert.deepEqual(images.map((image) => image._key), ["a", "b"]);
});

test("only an event with a Drive folder and no staged gallery is behind", () => {
  assert.equal(galleryBehind({ id: "4", driveFolderId: "f" }, {}), true);
  assert.equal(galleryBehind({ id: "4", driveFolderId: "f" }, { 4: "a:1" }), false);
  assert.equal(galleryBehind({ id: "4", driveFolderId: "" }, {}), false);
});

test("the gallery is on in dev, off in production until checked on a phone", () => {
  assert.equal(galleryEnabled({ SITE_ENV: "dev" }), true);
  assert.equal(galleryEnabled({ SITE_ENV: "production" }), false);
});
