/**
 * What every VenueRepository adapter must do (#240): the same cases run in
 * memory and on D1 (SQLite with the real migrations), plus the copy between
 * them.
 */
import assert from "node:assert/strict";
import { it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { assertValidWeek } from "../hours-model.js";
import { assertValidParties } from "../parties-model.js";
import { d1VenueRepository } from "./adapters/d1-venue.js";
import { memoryVenueRepository } from "./adapters/memory-venue.js";
import { venueRepository } from "./venue-repository.js";

const ADAPTERS = {
  memory: () => memoryVenueRepository(),
  d1: () => d1VenueRepository(createTestD1("ops")),
};

const DAYS_IN = [
  { day: "mon", closed: true },
  { day: "tue", opens: "17:00", closes: "22:00" },
  { day: "wed", opens: "17:00", closes: "22:30" },
  { day: "thu", opens: "17:00", closes: "22:30" },
  { day: "fri", opens: "16:00", closes: "23:30" },
  { day: "sat", opens: "16:00", closes: "01:00" },
  { day: "sun", opens: "16:00", closes: "22:00" },
];

const week = (overrides = {}) => ({
  days: assertValidWeek(DAYS_IN),
  updatedAt: "2026-11-11T09:00:00.000Z",
  updatedBy: "owner@gwenda.co.uk",
  ...overrides,
});

const parties = (facts = {}, overrides = {}) => ({
  ...assertValidParties({
    standing: 80,
    seated: 40,
    included: "No hire fee\nA booth held for you",
    replyWithin: "a day",
    ...facts,
  }),
  updatedAt: "2026-11-11T10:00:00.000Z",
  updatedBy: "owner@gwenda.co.uk",
  ...overrides,
});

/** A gallery photo as the use cases hand one in: its asset is a Sanity image id. */
const photo = (n, overrides = {}) => ({
  key: `photo${n}`,
  asset: `image-${String(n).repeat(40).slice(0, 40)}-1600x1067-webp`,
  description: `Photo ${n}`,
  menu: "",
  added: `2026-11-1${n % 10}T10:00:00.000Z`,
  addedBy: "owner@gwenda.co.uk",
  ...overrides,
});

const keys = (photos) => photos.map((p) => p.key);

repositoryContract("VenueRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    await repo.saveOpeningHours(week());
    await repo.saveParties(parties());
    await repo.addGalleryPhotos([photo(1), photo(2, { menu: "drinks" })]);
    await repo.addGalleryPhotos([photo(3)]);
    await repo.orderGallery(["photo2", "photo3", "photo1"]);
  },
  cases: {
    "has no photos until some are added": async (repo) => {
      assert.deepEqual(await repo.listGallery(), []);
    },
    "adds photos first, in the order given, and reads them back as added": async (repo) => {
      assert.deepEqual(await repo.addGalleryPhotos([photo(1), photo(2, { menu: "drinks" })]), [
        photo(1),
        photo(2, { menu: "drinks" }),
      ]);
      const after = await repo.addGalleryPhotos([photo(3)]);
      assert.deepEqual(keys(after), ["photo3", "photo1", "photo2"]);
      assert.deepEqual(await repo.listGallery(), after);
      assert.deepEqual(after[2], photo(2, { menu: "drinks" }));
    },
    "a photo already in the gallery isn't added again, under any key": async (repo) => {
      await repo.addGalleryPhotos([photo(1)]);
      const after = await repo.addGalleryPhotos([photo(1, { key: "again" }), photo(4), photo(4, { key: "twice" })]);
      assert.deepEqual(keys(after), ["photo4", "photo1"]);
    },
    "describes a photo: its line, its board, or both, and nothing else changes": async (repo) => {
      await repo.addGalleryPhotos([photo(1), photo(2)]);
      assert.deepEqual(
        await repo.updateGalleryPhoto("photo2", { description: "The terrace at dusk" }),
        photo(2, { description: "The terrace at dusk" }),
      );
      assert.deepEqual(
        await repo.updateGalleryPhoto("photo2", { menu: "food" }),
        photo(2, { description: "The terrace at dusk", menu: "food" }),
      );
      await repo.updateGalleryPhoto("photo2", { description: "", menu: "" });
      assert.deepEqual(await repo.listGallery(), [photo(1), photo(2, { description: "", menu: "" })]);
    },
    "describing a photo it hasn't got is null, and changes nothing": async (repo) => {
      await repo.addGalleryPhotos([photo(1)]);
      assert.equal(await repo.updateGalleryPhoto("nope", { description: "x" }), null);
      assert.deepEqual(await repo.listGallery(), [photo(1)]);
    },
    "puts the gallery in a new order, and new photos still go first": async (repo) => {
      await repo.addGalleryPhotos([photo(1), photo(2), photo(3)]);
      assert.deepEqual(keys(await repo.orderGallery(["photo3", "photo1", "photo2"])), ["photo3", "photo1", "photo2"]);
      assert.deepEqual(keys(await repo.addGalleryPhotos([photo(4)])), ["photo4", "photo3", "photo1", "photo2"]);
      assert.deepEqual(keys(await repo.orderGallery(["photo2", "photo4", "photo3", "photo1"])), [
        "photo2",
        "photo4",
        "photo3",
        "photo1",
      ]);
    },
    "removes a photo; one it hasn't got is no change": async (repo) => {
      await repo.addGalleryPhotos([photo(1), photo(2), photo(3)]);
      assert.deepEqual(keys(await repo.removeGalleryPhoto("photo2")), ["photo1", "photo3"]);
      assert.deepEqual(keys(await repo.removeGalleryPhoto("photo2")), ["photo1", "photo3"]);
      // Once it's gone the same picture may come back
      assert.deepEqual(keys(await repo.addGalleryPhotos([photo(2, { key: "back" })])), ["back", "photo1", "photo3"]);
    },
    "the gallery and the rest of the details don't touch each other": async (repo) => {
      await repo.saveOpeningHours(week());
      await repo.saveParties(parties());
      await repo.addGalleryPhotos([photo(1)]);
      await repo.removeGalleryPhoto("photo1");
      assert.deepEqual(await repo.getOpeningHours(), week());
      assert.deepEqual(await repo.getParties(), parties());
      await repo.addGalleryPhotos([photo(2)]);
      await repo.saveParties(parties({ standing: "" }));
      assert.deepEqual(await repo.listGallery(), [photo(2)]);
    },
    "has no opening hours until they are saved": async (repo) => {
      assert.equal(await repo.getOpeningHours(), null);
    },
    "saves the week and reads it back, Monday first, a late close as it was": async (repo) => {
      assert.deepEqual(await repo.saveOpeningHours(week()), week());
      const read = await repo.getOpeningHours();
      assert.deepEqual(read, week());
      assert.deepEqual(read.days[5], { day: "sat", closed: false, opens: "16:00", closes: "01:00" });
    },
    "a save replaces the whole week, with who and when": async (repo) => {
      await repo.saveOpeningHours(week());
      const days = assertValidWeek(
        DAYS_IN.map((day) => (day.day === "mon" ? { day: "mon", opens: "12:00", closes: "18:00" } : day)).map(
          (day) => (day.day === "sun" ? { day: "sun", closed: true } : day),
        ),
      );
      const next = { days, updatedAt: "2026-11-12T10:00:00.000Z", updatedBy: "staff@gwenda.co.uk" };
      assert.deepEqual(await repo.saveOpeningHours(next), next);
      const read = await repo.getOpeningHours();
      assert.deepEqual(read.days[0], { day: "mon", closed: false, opens: "12:00", closes: "18:00" });
      assert.deepEqual(read.days[6], { day: "sun", closed: true, opens: "", closes: "" });
      assert.equal(read.updatedBy, "staff@gwenda.co.uk");
    },
    "a closed day keeps no times": async (repo) => {
      const days = week().days.map((day) => (day.day === "tue" ? { ...day, closed: true } : day));
      const saved = await repo.saveOpeningHours(week({ days }));
      assert.deepEqual(saved.days[1], { day: "tue", closed: true, opens: "", closes: "" });
    },
    "has no party facts until they are saved": async (repo) => {
      assert.equal(await repo.getParties(), null);
    },
    "saves the party facts and reads them back, lines and all": async (repo) => {
      assert.deepEqual(await repo.saveParties(parties()), parties());
      const read = await repo.getParties();
      assert.deepEqual(read, parties());
      assert.equal(read.standing, 80);
      assert.equal(read.included, "No hire fee\nA booth held for you");
    },
    "a save replaces every fact, blanks included, with who and when": async (repo) => {
      await repo.saveParties(parties());
      const next = parties(
        { standing: "", included: "", replyWithin: "" },
        { updatedAt: "2026-11-12T10:00:00.000Z", updatedBy: "staff@gwenda.co.uk" },
      );
      assert.deepEqual(next, {
        standing: null,
        seated: 40,
        included: "",
        replyWithin: "",
        updatedAt: "2026-11-12T10:00:00.000Z",
        updatedBy: "staff@gwenda.co.uk",
      });
      assert.deepEqual(await repo.saveParties(next), next);
      assert.deepEqual(await repo.getParties(), next);
    },
    "saved all blank is saved, not never saved": async (repo) => {
      const blank = parties({ standing: "", seated: "", included: "", replyWithin: "" });
      assert.deepEqual(await repo.saveParties(blank), blank);
      assert.deepEqual(await repo.getParties(), blank);
    },
    "the hours and the party facts don't touch each other": async (repo) => {
      await repo.saveOpeningHours(week());
      await repo.saveParties(parties());
      assert.deepEqual(await repo.getOpeningHours(), week());
      await repo.saveOpeningHours(week({ updatedBy: "staff@gwenda.co.uk" }));
      assert.deepEqual(await repo.getParties(), parties());
    },
  },
});

it("is the D1 adapter unless one is handed in", async () => {
  const handed = memoryVenueRepository();
  assert.equal(venueRepository({ venueRepository: handed }), handed);
  const db = createTestD1("ops");
  await venueRepository({ OPS_DB: db, SITE_ENV: "dev" }).saveOpeningHours(week());
  assert.deepEqual(await d1VenueRepository(db).getOpeningHours(), week());
  await venueRepository({ OPS_DB: db, SITE_ENV: "dev" }).saveParties(parties());
  assert.deepEqual(await d1VenueRepository(db).getParties(), parties());
  await venueRepository({ OPS_DB: db, SITE_ENV: "dev" }).addGalleryPhotos([photo(1)]);
  assert.deepEqual(await d1VenueRepository(db).listGallery(), [photo(1)]);
});
