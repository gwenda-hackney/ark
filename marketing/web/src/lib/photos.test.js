import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BOOKINGS_PHOTOS,
  EVENT_PHOTO_EVENTS,
  EVENT_PHOTOS_PER_EVENT,
  HOME_PHOTOS,
  MENU_BOARD_PHOTOS,
  PHOTO_MENUS,
  addPhoto,
  eventPhotoGroups,
  homePhotoPlan,
  homePhotos,
  listPhotos,
  menuPhotos,
  photoSlug,
} from "./photos.js";

const image = (width, height) => ({ src: `/x-${width}.webp`, width, height });

describe("listPhotos", () => {
  const files = {
    "gallery/a.webp": image(1200, 1600),
    "gallery/b.jpg": image(240, 240),
    "story/c.png": image(1448, 1086),
  };

  it("keeps the list's order and works out each photo's shape", () => {
    const photos = listPhotos(
      [
        { file: "story/c.png", alt: "The room" },
        { file: "gallery/a.webp", alt: "A burger", link: "https://x.test/p" },
      ],
      files,
    );
    expect(photos.map((photo) => photo.file)).toEqual([
      "story/c.png",
      "gallery/a.webp",
    ]);
    expect(photos[0]).toMatchObject({ alt: "The room", ratio: 1.333 });
    expect(photos[1]).toMatchObject({ ratio: 0.75, link: "https://x.test/p" });
    expect(photos[1].image).toBe(files["gallery/a.webp"]);
  });

  it("leaves out a missing file instead of breaking the page", () => {
    const photos = listPhotos(
      [
        { file: "gallery/gone.webp", alt: "Gone" },
        { file: "gallery/b.jpg", alt: "Here" },
        {},
      ],
      files,
    );
    expect(photos.map((photo) => photo.file)).toEqual(["gallery/b.jpg"]);
  });

  it("shows a file listed twice once", () => {
    const photos = listPhotos(
      [
        { file: "gallery/b.jpg", alt: "First" },
        { file: "gallery/b.jpg", alt: "Again" },
      ],
      files,
    );
    expect(photos).toHaveLength(1);
    expect(photos[0].alt).toBe("First");
  });

  it("is empty for no list", () => {
    expect(listPhotos(undefined, files)).toEqual([]);
  });

  it("says which menu board a photo is for, if any", () => {
    const photos = listPhotos(
      [
        { file: "gallery/a.webp", alt: "A burger", menu: "food" },
        { file: "gallery/b.jpg", alt: "A spritz", menu: "drinks" },
        { file: "story/c.png", alt: "The room", menu: "the room" },
      ],
      files,
    );
    expect(photos.map((photo) => photo.menu)).toEqual(["food", "drinks", ""]);
  });
});

describe("menuPhotos", () => {
  const tagged = (name, menu) => ({
    file: `gallery/${name}.webp`,
    menu,
    image: { src: `/${name}.webp`, width: 1200, height: 1500 },
  });
  const photos = [
    tagged("room", ""),
    tagged("spritz", "drinks"),
    tagged("burger", "food"),
    tagged("margarita", "drinks"),
    tagged("negroni", "drinks"),
    tagged("fries", "food"),
  ];

  it("is a board's own photos, newest first, as many as it has room for", () => {
    const names = (list) => list.map((photo) => photo.file);
    expect(names(menuPhotos(photos, "drinks", { limit: 2 }))).toEqual([
      "gallery/spritz.webp",
      "gallery/margarita.webp",
    ]);
    expect(names(menuPhotos(photos, "food", { limit: 1 }))).toEqual([
      "gallery/burger.webp",
    ]);
  });

  it("is empty for a board with no photos of its own", () => {
    expect(menuPhotos(photos.slice(0, 1), "drinks")).toEqual([]);
    expect(menuPhotos(undefined, "food")).toEqual([]);
  });
});

describe("homePhotoPlan", () => {
  const entry = (name, menu) => ({
    file: `gallery/${name}.webp`,
    alt: `A photo of ${name}`,
    ...(menu ? { menu } : {}),
  });
  const list = [
    entry("room"),
    entry("spritz", "drinks"),
    entry("terrace"),
    entry("burger", "food"),
    entry("decks"),
    entry("margarita", "drinks"),
    entry("canal"),
    entry("fries", "food"),
    entry("gate"),
    entry("stools"),
  ];
  const files = Object.fromEntries(
    list.map(({ file }) => [
      file,
      { src: `/${file}`, width: 1200, height: 1500 },
    ]),
  );
  const plan = (entries) => homePhotoPlan(listPhotos(entries, files));
  const names = (photos) =>
    photos.map((photo) => photo.file.replace(/^gallery\/|\.webp$/g, ""));

  it("gives each board its two newest photos, and the row the newest of the rest", () => {
    expect(MENU_BOARD_PHOTOS).toBe(2);
    const home = plan(list);
    expect(names(home.drinks)).toEqual(["spritz", "margarita"]);
    expect(names(home.food)).toEqual(["burger", "fries"]);
    expect(names(home.row)).toEqual([
      "room",
      "terrace",
      "decks",
      "canal",
      "gate",
      "stools",
    ]);
  });

  it("never shows a photo twice", () => {
    const home = plan(list);
    const shown = [...home.drinks, ...home.food, ...home.row].map(
      (photo) => photo.image.src,
    );
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("puts a newly added drinks photo on the Drinks board", () => {
    const added = addPhoto(list, {
      file: "gallery/negroni.webp",
      alt: "A negroni on the bar",
      menu: "drinks",
    });
    files["gallery/negroni.webp"] = {
      src: "/gallery/negroni.webp",
      width: 1200,
      height: 1500,
    };
    const home = plan(added);
    expect(names(home.drinks)).toEqual(["negroni", "spritz"]);
    // The margarita it takes the place of goes back to the row
    expect(names(home.row)).toContain("margarita");
  });

  it("fills the rows when there are enough, and counts the rest for /photos", () => {
    const extra = ["bar", "bench", "sign", "boat"].map((name) => entry(name));
    for (const { file } of extra) {
      files[file] = { src: `/${file}`, width: 1200, height: 1500 };
    }
    const all = [...list, ...extra];
    const home = plan(all);
    expect(home.row).toHaveLength(HOME_PHOTOS);
    expect(home.more).toBe(all.length - HOME_PHOTOS);
  });

  it("shows what there is when the boards leave fewer than the rows hold", () => {
    // Ten photos, four on the boards: six for the rows, not eight
    const home = plan(list);
    expect(home.row).toHaveLength(6);
    expect(home.more).toBe(list.length - 6);
  });

  it("leaves a board without a photo when none is marked for it", () => {
    const home = plan(list.map(({ menu, ...rest }) => rest));
    expect(home.drinks).toEqual([]);
    expect(home.food).toEqual([]);
    expect(names(home.row)).toEqual(
      names(listPhotos(list, files)).slice(0, HOME_PHOTOS),
    );
  });
});

describe("homePhotoPlan's Bookings", () => {
  const entry = (file, menu) => ({
    file,
    alt: `A photo of ${file}`,
    ...(menu ? { menu } : {}),
  });
  const list = [
    entry("gallery/room.webp"),
    entry(BOOKINGS_PHOTOS.party),
    entry("gallery/spritz.webp", "drinks"),
    entry(BOOKINGS_PHOTOS.table),
    entry("gallery/canal.webp"),
  ];
  const files = Object.fromEntries(
    list.map(({ file }) => [
      file,
      { src: `/${file}`, width: 1200, height: 1500 },
    ]),
  );
  const plan = (entries) => homePhotoPlan(listPhotos(entries, files));

  it("pins the terrace by Book a table and the terrace at night by Have a party", () => {
    const { bookings } = plan(list);
    expect(bookings.table?.file).toBe(BOOKINGS_PHOTOS.table);
    expect(bookings.party?.file).toBe(BOOKINGS_PHOTOS.party);
  });

  it("keeps them off the photo row, so neither is on home twice", () => {
    const { row } = plan(list);
    expect(row.map((photo) => photo.file)).toEqual([
      "gallery/room.webp",
      "gallery/canal.webp",
    ]);
  });

  it("leaves a half without a print when its file isn't listed", () => {
    const { bookings, row } = plan(
      list.filter((item) => item.file !== BOOKINGS_PHOTOS.table),
    );
    expect(bookings.table).toBeNull();
    expect(bookings.party?.file).toBe(BOOKINGS_PHOTOS.party);
    expect(row).toHaveLength(2);
  });
});

describe("homePhotoPlan with a pop-up kitchen", () => {
  const entry = (name, menu) => ({
    file: `gallery/${name}.webp`,
    alt: `A photo of ${name}`,
    ...(menu ? { menu } : {}),
  });
  const list = [
    entry("room"),
    entry("spritz", "drinks"),
    entry("burger", "food"),
    entry("margarita", "drinks"),
    entry("fries", "food"),
    entry("canal"),
  ];
  /** A venue photo's file, with the hash of its bytes (photo-sources.ts). */
  const files = Object.fromEntries(
    list.map(({ file }) => [
      file,
      { src: `/${file}`, width: 1200, height: 1500 },
    ]),
  );
  const venue = () =>
    listPhotos(list, files).map((photo) => ({
      ...photo,
      hash: `hash-${photo.file}`,
    }));
  /** A photo from the pop-up's gallery in ops, newest first. */
  const kitchenPhoto = (name, hash = `hash-${name}`) => ({
    url: `https://cdn.test/${name}.jpg`,
    width: 1200,
    height: 1500,
    alt: "",
    hash,
  });
  const names = (photos) =>
    photos.map(
      (photo) =>
        photo.file?.replace(/^gallery\/|\.webp$/g, "") ||
        photo.url.replace(/^.*\/|\.jpg$/g, ""),
    );

  it("puts the pop-up's newest gallery photos on the Food board", () => {
    const home = homePhotoPlan(venue(), {
      kitchen: ["smash", "pickles", "queue"].map((name) => kitchenPhoto(name)),
    });
    expect(names(home.food)).toEqual(["smash", "pickles"]);
    // Drinks stays as it is
    expect(names(home.drinks)).toEqual(["spritz", "margarita"]);
  });

  it("tops the board up with the food photos when the pop-up has fewer than it holds", () => {
    const home = homePhotoPlan(venue(), { kitchen: [kitchenPhoto("smash")] });
    expect(names(home.food)).toEqual(["smash", "burger"]);
  });

  it("is the food photos, as before, with no pop-up or nothing in its gallery", () => {
    expect(names(homePhotoPlan(venue()).food)).toEqual(["burger", "fries"]);
    expect(names(homePhotoPlan(venue(), { kitchen: [] }).food)).toEqual([
      "burger",
      "fries",
    ]);
  });

  it("never puts the same picture up twice when the pop-up's photo is also a food photo", () => {
    // The pop-up's gallery has the burger photo the venue list has too
    const home = homePhotoPlan(venue(), {
      kitchen: [kitchenPhoto("chez-burger", "hash-gallery/burger.webp")],
    });
    expect(names(home.food)).toEqual(["chez-burger", "fries"]);
    expect(names(home.row)).not.toContain("burger");
  });

  it("sends the food photos the pop-up takes the place of back to the row", () => {
    const home = homePhotoPlan(venue(), {
      kitchen: [kitchenPhoto("smash"), kitchenPhoto("pickles")],
    });
    expect(names(home.row)).toEqual(["room", "burger", "fries", "canal"]);
  });

  it("leaves out a pop-up photo with no picture", () => {
    const home = homePhotoPlan(venue(), {
      kitchen: [{ url: "", width: 0, height: 0 }, kitchenPhoto("smash")],
    });
    expect(names(home.food)).toEqual(["smash", "burger"]);
  });
});

describe("eventPhotoGroups", () => {
  const shot = (
    name,
    { added = "2026-10-01T20:00:00Z", size = 1600 } = {},
  ) => ({
    url: `https://cdn.test/${name}.jpg`,
    width: size,
    height: Math.round(size * 0.75),
    alt: "",
    added,
    hash: `hash-${name}`,
  });
  const names = (group) =>
    group.photos.map((photo) => photo.url.replace(/^.*\/|\.jpg$/g, ""));

  it("puts each event's photos under its name, the event with the newest photo first", () => {
    const groups = eventPhotoGroups([
      {
        id: "karaoke",
        title: "Karaoke with Ross",
        href: "/whats-on/karaoke",
        photos: [shot("k1", { added: "2026-10-02T21:00:00Z" })],
      },
      {
        id: "friday",
        title: "Friday, With Guests",
        href: "/whats-on/friday",
        photos: [shot("f1", { added: "2026-11-06T23:00:00Z" }), shot("f2")],
      },
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      "Friday, With Guests",
      "Karaoke with Ross",
    ]);
    expect(names(groups[0])).toEqual(["f1", "f2"]);
    expect(groups[0]).toMatchObject({ href: "/whats-on/friday", more: 0 });
  });

  it("shows an event's newest few and counts the rest, so one big night can't take the page", () => {
    expect(EVENT_PHOTOS_PER_EVENT).toBe(6);
    const ten = Array.from({ length: 10 }, (_, i) => shot(`n${i}`));
    const [group] = eventPhotoGroups([{ id: "x", title: "X", photos: ten }]);
    expect(names(group)).toEqual(["n0", "n1", "n2", "n3", "n4", "n5"]);
    expect(group.more).toBe(4);
  });

  it("shows the newest eight events, so the page doesn't grow for ever", () => {
    expect(EVENT_PHOTO_EVENTS).toBe(8);
    const events = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      title: `Event ${i}`,
      photos: [shot(`p${i}`, { added: `2026-10-${String(10 + i)}T20:00:00Z` })],
    }));
    const groups = eventPhotoGroups(events);
    expect(groups.map((group) => group.id)).toEqual([
      "e9",
      "e8",
      "e7",
      "e6",
      "e5",
      "e4",
      "e3",
      "e2",
    ]);
  });

  it("leaves out a photo too small to show sharp in a column", () => {
    const [group] = eventPhotoGroups([
      {
        id: "x",
        title: "X",
        photos: [shot("thumb", { size: 240 }), shot("big")],
      },
    ]);
    expect(names(group)).toEqual(["big"]);
  });

  it("shows a photo once, however many events or walls it's on", () => {
    const groups = eventPhotoGroups(
      [
        {
          id: "chez",
          title: "Chez Pickle",
          photos: [
            shot("burger", { added: "2026-11-10T20:00:00Z" }),
            shot("fries"),
          ],
        },
        { id: "karaoke", title: "Karaoke", photos: [shot("burger")] },
        { id: "venue-too", title: "Already up", photos: [shot("terrace")] },
      ],
      { shownElsewhere: ["hash-fries", "hash-terrace"] },
    );
    expect(groups.map((group) => group.id)).toEqual(["chez"]);
    expect(names(groups[0])).toEqual(["burger"]);
  });

  it("is empty with no events or no photos", () => {
    expect(eventPhotoGroups(undefined)).toEqual([]);
    expect(eventPhotoGroups([{ id: "x", title: "X", photos: [] }])).toEqual([]);
  });
});

describe("homePhotos", () => {
  const photo = (name) => ({
    file: `gallery/${name}.webp`,
    image: image(9, 9),
  });
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    file: `gallery/${i}.webp`,
    image: { src: `/x-${i}.webp`, width: 9, height: 9 },
  }));

  it("is two rows of four on a desk", () => {
    expect(HOME_PHOTOS).toBe(8);
  });

  it("shows the newest few and counts the rest", () => {
    const home = homePhotos(twelve);
    expect(home.photos).toEqual(twelve.slice(0, HOME_PHOTOS));
    expect(home.more).toBe(12 - HOME_PHOTOS);
  });

  it("has nothing more when they all fit", () => {
    const three = ["a", "b", "c"].map(photo);
    expect(homePhotos(three)).toEqual({ photos: three, more: 0 });
  });

  it("leaves out a photo home already shows, and takes the next one", () => {
    const home = homePhotos(twelve, { shownElsewhere: ["/x-2.webp"] });
    expect(home.photos.map((p) => p.file)).toEqual([
      "gallery/0.webp",
      "gallery/1.webp",
      "gallery/3.webp",
      "gallery/4.webp",
      "gallery/5.webp",
      "gallery/6.webp",
      "gallery/7.webp",
      "gallery/8.webp",
    ]);
    // It is still on /photos: one more there than home shows
    expect(home.more).toBe(4);
  });

  it("takes how many to show", () => {
    expect(homePhotos(twelve, { limit: 2 }).photos).toHaveLength(2);
  });
});

describe("photoSlug", () => {
  it("makes a plain file name from a phone's", () => {
    expect(photoSlug("WhatsApp Image 2026-11-10 at 8.48.50 PM (1).jpeg")).toBe(
      "whatsapp-image-2026-11-10-at-8-48-50-pm-1",
    );
    expect(photoSlug("IMG_0042.HEIC")).toBe("img-0042");
  });
});

describe("addPhoto", () => {
  const list = [
    { file: "gallery/a.webp", alt: "A" },
    { file: "gallery/b.webp", alt: "B" },
  ];

  it("puts the new photo first", () => {
    const next = addPhoto(list, { file: "gallery/c.webp", alt: "C" });
    expect(next.map((item) => item.file)).toEqual([
      "gallery/c.webp",
      "gallery/a.webp",
      "gallery/b.webp",
    ]);
    expect(list).toHaveLength(2);
  });

  it("moves a photo added again to the front with its new words", () => {
    const next = addPhoto(list, { file: "gallery/b.webp", alt: "B, better" });
    expect(next).toEqual([
      { file: "gallery/b.webp", alt: "B, better" },
      { file: "gallery/a.webp", alt: "A" },
    ]);
  });

  it("keeps a link to where the photo was posted", () => {
    const [first] = addPhoto(list, {
      file: "gallery/c.webp",
      alt: "C",
      link: "https://www.instagram.com/p/abc/",
    });
    expect(first.link).toBe("https://www.instagram.com/p/abc/");
  });

  it("marks a photo for a menu board, and refuses a board there isn't", () => {
    const [first] = addPhoto(list, {
      file: "gallery/c.webp",
      alt: "C",
      menu: "drinks",
    });
    expect(first).toEqual({ file: "gallery/c.webp", alt: "C", menu: "drinks" });
    expect(() =>
      addPhoto(list, { file: "gallery/c.webp", alt: "C", menu: "wine" }),
    ).toThrow(/drinks or food/);
  });

  it("refuses a photo with no words for what it shows", () => {
    expect(() => addPhoto(list, { file: "gallery/c.webp", alt: " " })).toThrow(
      /what it shows/,
    );
  });
});

describe("src/data/photos.json", () => {
  const list = JSON.parse(
    readFileSync(new URL("../data/photos.json", import.meta.url), "utf8"),
  );
  const pathOf = (file) =>
    fileURLToPath(new URL(`../assets/images/${file}`, import.meta.url));

  it("lists only files that are there, each once, each described", () => {
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(existsSync(pathOf(entry.file)), entry.file).toBe(true);
      expect(entry.alt?.trim().length, entry.file).toBeGreaterThan(10);
    }
    expect(new Set(list.map((entry) => entry.file)).size).toBe(list.length);
  });

  it("has Bookings' two prints, neither of them on a menu board", () => {
    for (const file of Object.values(BOOKINGS_PHOTOS)) {
      const entry = list.find((item) => item.file === file);
      expect(entry, file).toBeDefined();
      expect(entry.menu, file).toBeUndefined();
    }
  });

  it("gives each menu board photos of its own, each for a board there is", () => {
    for (const entry of list.filter((item) => "menu" in item)) {
      expect(PHOTO_MENUS, entry.file).toContain(entry.menu);
    }
    for (const menu of PHOTO_MENUS) {
      expect(
        list.filter((entry) => entry.menu === menu).length,
        menu,
      ).toBeGreaterThan(0);
    }
  });
});
