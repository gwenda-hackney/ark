/**
 * What every EventRepository adapter must do (#186). The same cases run on
 * each adapter in ADAPTERS, and a copy from each into each one that can be
 * written to (memory, D1) must keep every record (#127).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { copyRoundTrip } from "../../../../../shared/testing/repository-contract.js";
import { createFakeWorld } from "../../testing/fake-world.js";
import { baserowEventRepository } from "./adapters/baserow-events.js";
import { d1EventRepository } from "./adapters/d1-events.js";
import { memoryEventRepository } from "./adapters/memory-events.js";
import { eventFieldsFromInput } from "./event-model.js";

const ADAPTERS = {
  memory: async () => ({ repo: memoryEventRepository(), done() {} }),
  baserow: async () => {
    const world = await createFakeWorld();
    world.install();
    return { repo: baserowEventRepository(world.env), done: () => world.restore() };
  },
  d1: async () => ({ repo: d1EventRepository(createTestD1("ops")), done() {} }),
};

const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
const OTHER_ASSET = "image-ffeeddccbbaa99887766554433221100ffeeddcc-1200x800-png";

/** A full series as the editor saves it. */
function seriesFields(overrides = {}) {
  return {
    ...eventFieldsFromInput(
      {
        name: "Negroni Chess",
        artist: "The Knights",
        offer: "Two for one",
        pageUrl: "https://example.com/chess",
        takingApplications: true,
        shortDescription: "Chess and Negronis",
        description: "Bring a board.",
        operationsNotes: "Tables by the window",
        imageLinks: ["https://example.com/a.jpg"],
        heroCrops: { fit: "whole" },
        nightSchedule: [{ label: "Doors", startTime: "18:00", endTime: "" }],
        time: "6pm till late",
        startTime: "18:00",
        endTime: "23:00",
        startsOn: "2026-10-01",
        repeatUnit: "week",
        repeatEvery: 1,
        weekdays: ["thu"],
        endsOn: "2026-12-31",
        skippedDates: ["2026-10-15"],
        extraDates: ["2026-10-20"],
        replacesSeries: "",
      },
      { slug: "negroni-chess" },
    ),
    driveFolderId: "folder-1",
    mainImage: { asset: ASSET },
    ...overrides,
  };
}

function night(overrides = {}) {
  return {
    date: "2026-10-08",
    slug: "negroni-chess-2026-10-08",
    label: "Negroni Chess · 2026-10-08",
    sanityId: "",
    clickupTaskId: "",
    snapshots: {},
    overrides: {
      name: "Grandmaster night",
      artist: "",
      offer: "",
      pageUrl: "https://example.com/gm",
      description: "",
      shortDescription: "Special",
      time: "",
      startTime: "19:00",
      endTime: "",
      nightSchedule: [{ label: "Simul", startTime: "19:30", endTime: "" }],
      operationsNotes: "",
      imageLinks: [],
      image: { asset: OTHER_ASSET },
      heroCrops: null,
    },
    ...overrides,
  };
}

for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`EventRepository: ${name}`, () => {
    let repo;
    let done;
    beforeEach(async () => {
      ({ repo, done } = await make());
    });
    afterEach(() => done());

    it("keeps every field of a series", async () => {
      const fields = seriesFields();
      const created = await repo.create(fields);
      assert.ok(created.id);
      const { id: _id, ...stored } = await repo.get(created.id);
      assert.deepEqual(stored, { ...fields, formerSlugs: [], deletedAt: "", gallery: [] });
    });

    it("a gallery: empty, then photos newest first, each asset once", async () => {
      const { id } = await repo.create(seriesFields());
      assert.deepEqual((await repo.get(id)).gallery, []);
      const first = { key: "k1", asset: ASSET, date: "", added: "2026-10-05T09:00:00.000Z", source: "ops" };
      const second = { key: "k2", asset: OTHER_ASSET, date: "2026-10-08", added: "2026-10-05T09:01:00.000Z", source: "ops" };
      await repo.addGalleryPhoto(id, first);
      const added = await repo.addGalleryPhoto(id, second);
      assert.deepEqual(added.gallery, [second, first]);
      await repo.addGalleryPhoto(id, { ...first, key: "k3" });
      assert.deepEqual((await repo.get(id)).gallery, [second, first], "the same asset isn't added twice");
      const removed = await repo.removeGalleryPhoto(id, "k2");
      assert.deepEqual(removed.gallery, [first]);
      assert.deepEqual((await repo.get(id)).gallery, [first]);
    });

    it("a gallery on a missing series is a 404", async () => {
      await assert.rejects(repo.addGalleryPhoto("999999", { key: "k", asset: ASSET }), { status: 404 });
      await assert.rejects(repo.removeGalleryPhoto("999999", "k"), { status: 404 });
    });

    it("an update changes only the fields given", async () => {
      const { id } = await repo.create(seriesFields());
      await repo.update(id, { offer: "Happy hour", formerSlugs: ["chess"], deletedAt: "2026-10-05T08:00:00Z" });
      const event = await repo.get(id);
      assert.equal(event.offer, "Happy hour");
      assert.deepEqual(event.formerSlugs, ["chess"]);
      assert.equal(event.deletedAt, "2026-10-05T08:00:00Z");
      assert.equal(event.name, "Negroni Chess");
      assert.equal(event.slug, "negroni-chess");
      assert.deepEqual(event.mainImage, { asset: ASSET });
    });

    it("the main image can change or go", async () => {
      const { id } = await repo.create(seriesFields());
      await repo.update(id, { mainImage: { asset: OTHER_ASSET }, heroCrops: null });
      assert.deepEqual((await repo.get(id)).mainImage, { asset: OTHER_ASSET });
      assert.equal((await repo.get(id)).heroCrops, null);
      await repo.update(id, { mainImage: null });
      assert.equal((await repo.get(id)).mainImage, null);
    });

    it("a missing series is a 404", async () => {
      await assert.rejects(repo.get("999999"), { status: 404, message: "Event not found." });
      await assert.rejects(repo.update("999999", { offer: "x" }), { status: 404 });
    });

    it("lists series, with their own nights", async () => {
      const a = await repo.create(seriesFields());
      const b = await repo.create(seriesFields({ name: "Gwenda Live", slug: "gwenda-live" }));
      await repo.saveNight(a.id, night());
      const listed = await repo.listEventsWithNights();
      const byName = new Map(listed.map((entry) => [entry.event.name, entry]));
      assert.deepEqual(byName.get("Negroni Chess").nights.map((n) => n.date), ["2026-10-08"]);
      assert.deepEqual(byName.get("Gwenda Live").nights, []);
      assert.deepEqual((await repo.listEvents()).map((event) => event.id).sort(), [a.id, b.id].sort());
    });

    it("keeps a night and its overrides", async () => {
      const { id } = await repo.create(seriesFields());
      const saved = await repo.saveNight(id, night());
      const { id: nightId, googleCalendarEventId, ...stored } = await repo.getNight(saved.id);
      assert.equal(nightId, saved.id);
      assert.equal(googleCalendarEventId, "");
      assert.deepEqual(stored, night());
      assert.deepEqual((await repo.nightsOf(id)).map((n) => n.id), [saved.id]);
    });

    it("saving a night without overrides keeps them", async () => {
      const { id } = await repo.create(seriesFields());
      const saved = await repo.saveNight(id, night());
      const { overrides: _o, ...bare } = night({ id: saved.id, sanityId: "event-chess-2026-10-08" });
      await repo.saveNight(id, bare);
      const after = await repo.getNight(saved.id);
      assert.equal(after.sanityId, "event-chess-2026-10-08");
      assert.equal(after.overrides.name, "Grandmaster night");
      assert.deepEqual(after.overrides.image, { asset: OTHER_ASSET });
    });

    it("empty overrides come back empty", async () => {
      const { id } = await repo.create(seriesFields());
      const empty = {
        ...night().overrides,
        name: "",
        pageUrl: "",
        shortDescription: "",
        startTime: "",
        nightSchedule: null,
        image: null,
      };
      const saved = await repo.saveNight(id, night({ overrides: empty }));
      assert.deepEqual((await repo.getNight(saved.id)).overrides, empty);
    });

    it("saves many nights at once: updates the known, adds the new", async () => {
      const { id } = await repo.create(seriesFields());
      const first = await repo.saveNight(id, night());
      await repo.saveNights(id, [
        night({ id: first.id, sanityId: "event-1" }),
        night({ date: "2026-10-22", slug: "negroni-chess-2026-10-22", label: "Negroni Chess · 2026-10-22" }),
      ]);
      const nights = (await repo.nightsOf(id)).sort((a, b) => a.date.localeCompare(b.date));
      assert.deepEqual(nights.map((n) => [n.date, n.sanityId]), [
        ["2026-10-08", "event-1"],
        ["2026-10-22", ""],
      ]);
    });

    it("snapshots and calendar links", async () => {
      const { id } = await repo.create(seriesFields());
      const saved = await repo.saveNight(id, night());
      await repo.setNightCalendarLinks([{ id: saved.id, value: "abc123#hash" }]);
      assert.equal((await repo.getNight(saved.id)).googleCalendarEventId, "abc123#hash");
      await repo.saveNightSnapshots([{ id: saved.id, snapshots: { preview: { hash: "h1" } } }]);
      let after = await repo.getNight(saved.id);
      assert.deepEqual(after.snapshots, { preview: { hash: "h1" } });
      assert.equal(after.googleCalendarEventId, "abc123#hash", "kept unless asked to clear");
      await repo.saveNightSnapshots([{ id: saved.id, snapshots: {}, clearCalendar: true }]);
      after = await repo.getNight(saved.id);
      assert.equal(after.googleCalendarEventId, "");
    });

    it("removing nights and series; a missing night is fine", async () => {
      const { id } = await repo.create(seriesFields());
      const saved = await repo.saveNight(id, night());
      await repo.removeNight(saved.id);
      assert.equal(await repo.getNight(saved.id), null);
      await repo.removeNight(saved.id);
      await repo.remove(id);
      await assert.rejects(repo.get(id), { status: 404 });
    });

    it("says what it can keep", async () => {
      assert.deepEqual(await repo.capabilities(), {
        formerSlugs: true,
        shortDescriptionOverride: true,
        calendarLinks: true,
      });
    });
  });
}

/** Two series, nights with overrides, snapshots, a calendar link and a gallery. */
async function seed(repo) {
  const chess = await repo.create(seriesFields());
  const live = await repo.create(seriesFields({ name: "Gwenda Live", slug: "gwenda-live", mainImage: null, heroCrops: null }));
  await repo.update(live.id, { formerSlugs: ["live"], deletedAt: "2026-10-05T08:00:00Z", takingApplications: false });
  await repo.addGalleryPhoto(chess.id, { key: "k1", asset: ASSET, date: "", added: "2026-10-05T09:00:00.000Z", source: "ops" });
  const first = await repo.saveNight(chess.id, night());
  await repo.saveNight(chess.id, night({ date: "2026-10-22", slug: "negroni-chess-2026-10-22", overrides: undefined }));
  await repo.saveNight(live.id, night({ date: "2026-11-01", slug: "gwenda-live-2026-11-01", sanityId: "event-live-1" }));
  await repo.setNightCalendarLinks([{ id: first.id, value: "abc123#hash" }]);
  await repo.saveNightSnapshots([{ id: first.id, snapshots: { preview: { hash: "h1" } } }]);
}

describe("EventRepository: copy between adapters", () => {
  for (const [fromName, makeSource] of Object.entries(ADAPTERS)) {
    for (const toName of ["memory", "d1"]) {
      it(`${fromName} → ${toName} keeps every record`, async () => {
        const source = await makeSource();
        const target = await ADAPTERS[toName]();
        try {
          const { snapshot } = await copyRoundTrip(source.repo, target.repo, seed);
          assert.deepEqual(
            snapshot.nights.map((n) => n.eventId),
            [snapshot.events[0].id, snapshot.events[0].id, snapshot.events[1].id],
          );
          assert.equal(snapshot.nights[0].googleCalendarEventId, "abc123#hash");
          // The copy reads the same through the rest of the repository too.
          const [chess] = snapshot.events;
          assert.deepEqual(await target.repo.get(chess.id), chess);
          assert.equal((await target.repo.nightsOf(chess.id)).length, 2);
          // New records after a copy never reuse a copied id.
          const next = await target.repo.create(seriesFields({ slug: "after-copy" }));
          assert.ok(!snapshot.events.some((event) => event.id === next.id));
        } finally {
          source.done();
          target.done();
        }
      });
    }
  }
});

describe("EventRepository: d1 writes", () => {
  it("saves many nights, snapshots and calendar links in one batch each", async () => {
    const db = createTestD1("ops");
    let batches = 0;
    const counted = { prepare: (sql) => db.prepare(sql), batch: (statements) => (batches++, db.batch(statements)) };
    const repo = d1EventRepository(counted);
    const { id } = await repo.create(seriesFields());
    const first = await repo.saveNight(id, night());
    await repo.saveNights(id, [
      night({ id: first.id, sanityId: "event-1" }),
      night({ date: "2026-10-22", slug: "b" }),
      night({ date: "2026-10-29", slug: "c" }),
    ]);
    assert.equal(batches, 1);
    const ids = (await repo.nightsOf(id)).map((n) => n.id);
    await repo.saveNightSnapshots(ids.map((nightId) => ({ id: nightId, snapshots: { live: { hash: nightId } } })));
    await repo.setNightCalendarLinks(ids.map((nightId) => ({ id: nightId, value: `cal-${nightId}` })));
    assert.equal(batches, 3);
    assert.deepEqual((await repo.nightsOf(id)).map((n) => n.googleCalendarEventId), ids.map((nightId) => `cal-${nightId}`));
  });

  it("removing a series removes its nights", async () => {
    const repo = d1EventRepository(createTestD1("ops"));
    const { id } = await repo.create(seriesFields());
    const saved = await repo.saveNight(id, night());
    await repo.remove(id);
    assert.equal(await repo.getNight(saved.id), null);
  });
});
