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

repositoryContract("VenueRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    await repo.saveOpeningHours(week());
    await repo.saveParties(parties());
  },
  cases: {
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
});
