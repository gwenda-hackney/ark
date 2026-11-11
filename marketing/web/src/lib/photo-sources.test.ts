import { beforeEach, describe, expect, it, vi } from "vitest";
import { homePhotoPlan, photosPageEvents } from "./photos.js";
import { readVenueDetails } from "./venue-details.js";

/**
 * The venue's photos come from its Gallery in ops (#291), read with the
 * venue's details (VENUE_DETAILS_QUERY). What ops writes, run through that
 * query, is ops' contract test
 * (ops/site/src/venue/server/venue-website.website.contract.test.js); here
 * is what the site makes of what the query returns.
 */
const details = vi.hoisted(() => ({ gallery: [] as unknown[] }));
vi.mock("./sanity/venue-details", () => ({
  fetchVenueDetails: async () => ({
    openingHours: null,
    parties: null,
    gallery: details.gallery,
  }),
}));
/** What's on as Sanity has it: each series with its gallery from ops. */
const catalog = vi.hoisted(() => ({
  series: [] as unknown[],
  occurrences: [] as unknown[],
}));
vi.mock("./sanity/events", () => ({
  fetchWhatsOnCatalog: async () => catalog,
}));

const { eventPhotos, galleryPhotos, venuePhotos } =
  await import("./photo-sources");

const sha = (n: number) => n.toString(16).padStart(40, "a");
const CDN = "https://cdn.sanity.io/images/pn5yjro6/production";

/** A photo as VENUE_DETAILS_QUERY returns it: its asset's address, size and colours. */
const entry = (
  n: number,
  { width = 1600, height = 1067, ...rest }: Record<string, unknown> = {},
) => ({
  url: `${CDN}/${sha(n)}-${width}x${height}.webp`,
  width,
  height,
  alt: `Photo ${n}`,
  menu: null,
  added: "2026-11-11T10:00:00Z",
  lqip: "data:image/jpeg;base64,/9j/2wBDAAYEBQY=",
  color: "#3a2b1c",
  ...rest,
});

/** The document as the query returns it, through the website's own reader. */
const fromSanity = (gallery: unknown[]) =>
  readVenueDetails({ openingHours: null, parties: null, gallery }).gallery;

describe("venuePhotos: the Gallery as Sanity has it", () => {
  it("keeps the Gallery's order, each photo's size from its asset, its words and its board", () => {
    const photos = venuePhotos(
      fromSanity([
        entry(3, { menu: "drinks" }),
        entry(1, { width: 1200, height: 1600 }),
        entry(2, { menu: "food" }),
      ]),
    );
    expect(photos.map((photo) => photo.alt)).toEqual([
      "Photo 3",
      "Photo 1",
      "Photo 2",
    ]);
    expect(photos[1]).toEqual({
      url: `${CDN}/${sha(1)}-1200x1600.webp`,
      width: 1200,
      height: 1600,
      alt: "Photo 1",
      date: "",
      added: "2026-11-11T10:00:00Z",
      lqip: "data:image/jpeg;base64,/9j/2wBDAAYEBQY=",
      color: "#3a2b1c",
      hash: sha(1),
      menu: "",
      ratio: 0.75,
    });
    expect(photos.map((photo) => photo.menu)).toEqual(["drinks", "", "food"]);
    expect(photos[0].ratio).toBe(1.5);
  });

  it("leaves out a photo with no picture to show, and shows the same picture once", () => {
    const photos = venuePhotos(
      fromSanity([
        entry(1),
        { ...entry(2), url: null },
        { ...entry(3), width: null },
        entry(1, { alt: "Again" }),
        null,
        entry(4),
      ]),
    );
    expect(photos.map((photo) => photo.hash)).toEqual([sha(1), sha(4)]);
  });

  it("says something for a photo not described yet, and no board but the two", () => {
    const [photo] = venuePhotos(
      fromSanity([
        entry(1, { alt: "  ", menu: "bar", lqip: "x", color: "red" }),
      ]),
    );
    expect(photo.alt).toBe("A photo from Gwenda");
    expect(photo.menu).toBe("");
    expect(photo.lqip).toBe("");
    expect(photo.color).toBe("");
  });

  it("is none with no gallery", () => {
    expect(venuePhotos(fromSanity([]))).toEqual([]);
    expect(venuePhotos(readVenueDetails(null).gallery)).toEqual([]);
    expect(venuePhotos(undefined)).toEqual([]);
  });
});

describe("galleryPhotos", () => {
  beforeEach(() => {
    details.gallery = [];
  });

  it("is the venue's photos from its details in Sanity, in the Gallery's order", async () => {
    details.gallery = [entry(2, { menu: "drinks" }), entry(1)];
    const photos = await galleryPhotos();
    expect(photos.map((photo) => photo.hash)).toEqual([sha(2), sha(1)]);
    expect(photos[0].menu).toBe("drinks");
  });

  it("is none when the venue has no photos yet", async () => {
    expect(await galleryPhotos()).toEqual([]);
  });
});

describe("the venue's photos on home and on /photos", () => {
  const gallery = () =>
    venuePhotos(
      fromSanity([
        entry(1),
        entry(2, { menu: "drinks" }),
        entry(3),
        entry(4, { menu: "food" }),
        entry(5),
        entry(6, { menu: "drinks" }),
        entry(7),
        entry(8),
        entry(9),
        entry(10),
        entry(11),
        entry(12),
      ]),
    );

  it("home's boards take their photos, the row the first of the rest, none twice", () => {
    const home = homePhotoPlan(gallery());
    expect(home.drinks.map((photo) => photo.alt)).toEqual([
      "Photo 2",
      "Photo 6",
    ]);
    expect(home.food.map((photo) => photo.alt)).toEqual(["Photo 4"]);
    expect(home.row.map((photo) => photo.alt)).toEqual([
      "Photo 1",
      "Photo 3",
      "Photo 5",
      "Photo 7",
      "Photo 8",
      "Photo 9",
      "Photo 10",
      "Photo 11",
    ]);
    const shown = [...home.drinks, ...home.food, ...home.row].map(
      (photo) => photo.url,
    );
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("an event's copy of a venue photo shows once on /photos, on the venue's wall", () => {
    const photos = gallery();
    const groups = photosPageEvents(photos, [
      {
        id: "chez-pickle",
        title: "Chez Pickle",
        photos: [
          { ...photos[0], date: "", added: "2026-11-12" },
          {
            ...entry(20),
            hash: sha(20),
            date: "",
            added: "2026-11-12",
            alt: "",
          },
        ],
      },
    ]);
    expect(groups[0].photos.map((photo) => photo.hash)).toEqual([sha(20)]);
  });
});

describe("eventPhotos, and home's strip with them", () => {
  beforeEach(() => {
    details.gallery = [];
    catalog.series = [];
  });

  /** A series as SERIES_QUERY returns it, its gallery newest first. */
  const series = (id: string, gallery: unknown[]) => ({
    seriesId: id,
    title: `The ${id}`,
    description: "",
    gallery,
  });

  it("each event's photo comes with its shape and the hash of its picture", async () => {
    catalog.series = [
      series("karaoke", [
        entry(10, { width: 1200, height: 1600, alt: "", date: "2026-11-07" }),
      ]),
    ];
    const { events } = await eventPhotos("2026-11-11");
    expect(events[0].photos[0]).toMatchObject({
      hash: sha(10),
      ratio: 0.75,
      date: "2026-11-07",
    });
  });

  it("home's strip mixes in the newest photo of two events, never one the venue's wall has", async () => {
    details.gallery = [entry(1), entry(2), entry(3)];
    catalog.series = [
      series("karaoke", [entry(10, { added: "2026-11-08T22:00:00Z" })]),
      series("friday", [
        // The venue's second photo, uploaded to the event too
        entry(2, { added: "2026-11-10T02:00:00Z" }),
        entry(20, { added: "2026-11-10T01:00:00Z" }),
      ]),
      series("quiz", [entry(30, { added: "2026-10-02T20:00:00Z" })]),
    ];
    const { events } = await eventPhotos("2026-11-11");
    const home = homePhotoPlan(await galleryPhotos(), { events });
    expect(home.row.map((photo) => photo.hash)).toEqual([
      sha(1),
      sha(20),
      sha(2),
      sha(10),
      sha(3),
    ]);
  });
});
