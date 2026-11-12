/**
 * What ops' Gallery page counts on from photosPageEvents (lib/photos.js):
 * its "From events" shows the events the Photos page shows under the
 * venue's own, picked by this same function
 * (ops/site/src/venue/server/venue-gallery.js galleryFromEvents). Ops passes
 * the venue's photos with their hash and address, and each event as
 * events' listEventGalleries gives it (ops/site/src/events/server/
 * event-galleries.js), `name` as `title`, each photo with its hash; it reads
 * each group's id, title, `more`, and each photo's key, url, width, height
 * and added. A change here that would break that page fails here.
 *
 * Ops also badges a photo too small for the Photos page, by this same rule
 * (tooSmallForPhotos, and EVENT_PHOTO_MIN in its words): on an event's
 * Images tab (ops/site/src/events/gallery-photos.ts) and on the venue's own
 * photos (ops/site/src/venue/gallery-page.ts), through
 * ops/site/src/website/photos-page.ts. Under each event on its Gallery page
 * it says how many were left out as too small, and names an event left out
 * only for that: the one photosPageEvents shows with `min: 0` and not
 * without (venue-gallery.js galleryFromEvents).
 */
import { describe, expect, it } from "vitest";
import {
  EVENT_PHOTO_MIN,
  photosPageEvents,
  tooSmallForPhotos,
} from "./photos.js";

const sha = (n) => n.toString(16).padStart(40, "a");
const CDN = "https://cdn.sanity.io/images/proj/production";

/** A photo as ops has it: its Sanity asset, address and size, and its hash (withHash). */
const opsPhoto = (n, added, { width = 1600, height = 1200 } = {}) => ({
  key: `k${n}`,
  asset: `image-${sha(n)}-${width}x${height}-jpg`,
  url: `${CDN}/${sha(n)}-${width}x${height}.jpg`,
  width,
  height,
  added,
  hash: sha(n),
});

/** A venue photo as ops' Gallery keeps it (galleryPhotoView), with its hash. */
const venuePhoto = (n) => ({
  ...opsPhoto(n, "2026-09-01T10:00:00.000Z"),
  description: `Venue photo ${n}`,
  menu: "",
  addedBy: "owner",
});

/** An event as ops passes it: listEventGalleries' id and name (as title), and its photos newest first. */
const opsEvent = (id, photos) => ({ id, title: `Night ${id}`, photos });

/** What ops reads of each group. */
const asOpsReadsIt = (groups) =>
  groups.map((group) => ({
    id: group.id,
    title: group.title,
    more: group.more,
    photos: group.photos.map(({ key, url, width, height, added }) => ({
      key,
      url,
      width,
      height,
      added,
    })),
  }));

describe("photosPageEvents for ops' Gallery page", () => {
  it("gives each event by its id and title, the newest photo first, with the fields ops reads", () => {
    const quiz = opsPhoto(1, "2026-10-02T20:00:00.000Z");
    const mic = opsPhoto(2, "2026-11-06T22:00:00.000Z", {
      width: 900,
      height: 1200,
    });
    const crowd = opsPhoto(3, "2026-11-06T23:00:00.000Z");
    const groups = photosPageEvents(
      [],
      [opsEvent("4", [quiz]), opsEvent("12", [crowd, mic])],
    );
    expect(asOpsReadsIt(groups)).toEqual([
      {
        id: "12",
        title: "Night 12",
        more: 0,
        photos: [crowd, mic].map(({ key, url, width, height, added }) => ({
          key,
          url,
          width,
          height,
          added,
        })),
      },
      {
        id: "4",
        title: "Night 4",
        more: 0,
        photos: [
          {
            key: quiz.key,
            url: quiz.url,
            width: 1600,
            height: 1200,
            added: quiz.added,
          },
        ],
      },
    ]);
  });

  it("shows the newest eight events, each with its newest six and how many more", () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      opsEvent(
        String(i + 1),
        Array.from({ length: i === 8 ? 9 : 1 }, (_, j) =>
          opsPhoto(
            100 * (i + 1) + j,
            `2026-10-${10 + i}T${String(20 - j).padStart(2, "0")}:00:00.000Z`,
          ),
        ),
      ),
    );
    const groups = photosPageEvents([], events);
    expect(
      groups.map((group) => [group.id, group.photos.length, group.more]),
    ).toEqual([
      ["9", 6, 3],
      ...[8, 7, 6, 5, 4, 3, 2].map((n) => [String(n), 1, 0]),
    ]);
  });

  it("leaves out a copy of a venue photo, by its hash or its address, and an event left with none", () => {
    const terrace = venuePhoto(1);
    const gate = venuePhoto(2);
    const crowd = opsPhoto(10, "2026-11-06T21:00:00.000Z");
    const groups = photosPageEvents(
      [terrace, gate],
      [
        opsEvent("12", [
          // The terrace uploaded again: another key and asset name, the same picture
          {
            ...opsPhoto(11, "2026-11-06T22:00:00.000Z"),
            hash: terrace.hash,
          },
          // The venue's own asset, in the event's gallery too
          { ...gate, key: "g", hash: "", added: "2026-11-06T23:00:00.000Z" },
          crowd,
        ]),
        opsEvent("4", [
          { ...opsPhoto(12, "2026-11-09T21:00:00.000Z"), hash: terrace.hash },
        ]),
      ],
    );
    expect(asOpsReadsIt(groups)).toEqual([
      {
        id: "12",
        title: "Night 12",
        more: 0,
        photos: [
          {
            key: crowd.key,
            url: crowd.url,
            width: crowd.width,
            height: crowd.height,
            added: crowd.added,
          },
        ],
      },
    ]);
  });

  it("leaves out a photo too small to show sharp, as the Photos page does", () => {
    const groups = photosPageEvents(
      [],
      [
        opsEvent("12", [
          opsPhoto(1, "2026-11-06T22:00:00.000Z", { width: 400, height: 300 }),
        ]),
      ],
    );
    expect(groups).toEqual([]);
  });

  it("is none with no events", () => {
    expect(photosPageEvents([venuePhoto(1)], [])).toEqual([]);
  });

  it("with min 0, shows an event whose photos are all too small: ops names it as left out for that", () => {
    const events = [
      opsEvent("12", [
        opsPhoto(1, "2026-11-06T22:00:00.000Z", { width: 240, height: 240 }),
      ]),
      opsEvent("4", [opsPhoto(2, "2026-11-02T22:00:00.000Z")]),
    ];
    expect(photosPageEvents([], events).map((group) => group.id)).toEqual([
      "4",
    ]);
    expect(
      photosPageEvents([], events, { min: 0 }).map((group) => group.id),
    ).toEqual(["12", "4"]);
  });
});

describe("tooSmallForPhotos for ops' badges", () => {
  it("is a photo under EVENT_PHOTO_MIN on its long side: 240 × 240 is, 800 × 600 isn't", () => {
    expect(tooSmallForPhotos({ width: 240, height: 240 })).toBe(true);
    expect(tooSmallForPhotos({ width: 800, height: 600 })).toBe(false);
    expect(tooSmallForPhotos({ width: 600, height: 800 })).toBe(false);
    expect(tooSmallForPhotos({ width: EVENT_PHOTO_MIN - 1, height: 300 })).toBe(
      true,
    );
    expect(tooSmallForPhotos({ width: 300, height: EVENT_PHOTO_MIN })).toBe(
      false,
    );
  });

  it("isn't a photo with no size: there's nothing to measure", () => {
    expect(tooSmallForPhotos({ width: 0, height: 0 })).toBe(false);
    expect(tooSmallForPhotos({})).toBe(false);
    expect(tooSmallForPhotos(null)).toBe(false);
  });

  it("is the photos photosPageEvents leaves out for their size, and no others", () => {
    const sizes = [
      [240, 240],
      [799, 600],
      [800, 600],
      [600, 800],
      [1600, 1200],
    ];
    const photos = sizes.map(([width, height], i) =>
      opsPhoto(i + 1, `2026-11-0${i + 1}T20:00:00.000Z`, { width, height }),
    );
    const [group] = photosPageEvents([], [opsEvent("12", photos)]);
    expect(group.photos.map((photo) => photo.key).sort()).toEqual(
      photos
        .filter((photo) => !tooSmallForPhotos(photo))
        .map((photo) => photo.key)
        .sort(),
    );
    expect(photos.filter((photo) => tooSmallForPhotos(photo))).toHaveLength(2);
  });
});
