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
 */
import { describe, expect, it } from "vitest";
import { photosPageEvents } from "./photos.js";

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
});
