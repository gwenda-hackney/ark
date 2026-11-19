import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";
import { run } from "../../../shared/d1.js";
import {
  d1Table,
  exportTables,
  importTables,
} from "../../../shared/d1-table.js";
import { createTestD1 } from "../../../shared/testing/d1-sqlite.js";
import { moveBetween, parseArgs } from "../../data-move.mjs";
import { memoryMenuRepository } from "../../../ops/site/src/menu/server/adapters/memory-menu.js";
import { FEATURES, featureFor } from "./features.mjs";
import { describeMove, diffSnapshots, keptSnapshot, moveFeature } from "./index.mjs";

/** A repository in memory: exportAll / importAll only. */
function memory(snapshot = {}) {
  let data = structuredClone(snapshot);
  return {
    async exportAll() {
      return structuredClone(data);
    },
    async importAll(next) {
      data = structuredClone(next);
    },
  };
}

const people = d1Table({
  table: "people",
  columns: { id: "int", email: "text", tags: "json" },
});

/** A D1 repository over one table, as a feature's adapter composes them. */
async function d1People() {
  const db = createTestD1(null);
  await run(
    db,
    "CREATE TABLE people (id INTEGER PRIMARY KEY, email TEXT NOT NULL, tags TEXT)",
  );
  return {
    async exportAll() {
      const { people: rows } = await exportTables(db, [people]);
      return { people: rows };
    },
    async importAll(snapshot) {
      await importTables(db, [[people, snapshot.people]]);
    },
  };
}

const SNAPSHOT = {
  people: [
    { id: 3, email: "a@example.com", tags: ["prelaunch"] },
    {
      id: 9,
      email: "alerts+signup-smoke@gwenda.co.uk",
      tags: ["prelaunch", "wifi"],
    },
  ],
};

describe("moveFeature", () => {
  it("copies into D1 keeping ids, leaves out what the feature never copies, and checks", async () => {
    const lines = [];
    const target = await d1People();
    const result = await moveFeature({
      source: memory(SNAPSHOT),
      target,
      keep: (_collection, record) => !record.email.startsWith("alerts+"),
      log: (line) => lines.push(line),
    });
    assert.deepEqual(result, { counts: { people: 1 }, skipped: { people: 1 }, detached: {} });
    assert.deepEqual(await target.exportAll(), {
      people: [SNAPSHOT.people[0]],
    });
    assert.deepEqual(lines, [
      "exported: 1 people (left out: 1 people)",
      "imported",
      "checked: the target matches the source record for record",
    ]);
  });

  it("fails when the target doesn't read back what went in", async () => {
    const lossy = {
      ...memory(),
      async exportAll() {
        return { people: [{ ...SNAPSHOT.people[0], tags: [] }] };
      },
    };
    const lines = [];
    await assert.rejects(
      moveFeature({
        source: memory(SNAPSHOT),
        target: lossy,
        log: (line) => lines.push(line),
      }),
      /2 difference\(s\)/,
    );
    assert.ok(lines.includes("  people 3: changed (tags)"));
    assert.ok(lines.includes("  people 9: missing"));
  });
});

describe("diffSnapshots", () => {
  it("compares by id, ignores key order, and never reports values", () => {
    const a = { x: [{ id: 1, v: { b: 1, a: 2 } }, { id: 2 }] };
    const b = { x: [{ id: 1, v: { a: 2, b: 1 } }, { id: 3 }], y: [{ id: 1 }] };
    assert.deepEqual(diffSnapshots(a, b), [
      { collection: "x", id: "2", kind: "missing" },
      { collection: "x", id: "3", kind: "extra" },
      { collection: "y", id: "1", kind: "extra" },
    ]);
  });

  it("keptSnapshot filters per collection", () => {
    assert.deepEqual(
      keptSnapshot({ a: [{ id: 1 }, { id: 2 }] }, (_c, r) => r.id === 2),
      { a: [{ id: 2 }] },
    );
  });
});

describe("data-move CLI", () => {
  it("parses sides, defaults to a dry run, and only moves onto D1", () => {
    assert.deepEqual(
      parseArgs([
        "--feature",
        "events",
        "--from",
        "d1:production",
        "--to",
        "d1:dev",
      ]),
      {
        feature: "events",
        from: { kind: "d1", env: "production" },
        to: { kind: "d1", env: "dev" },
        write: false,
      },
    );
    assert.throws(
      () =>
        parseArgs([
          "--feature",
          "e",
          "--from",
          "d1:dev",
          "--to",
          "postgres:dev",
        ]),
      /--to must be d1/,
    );
    assert.throws(
      () =>
        parseArgs([
          "--feature",
          "e",
          "--from",
          "d1:staging",
          "--to",
          "d1:dev",
        ]),
      /--from must be/,
    );
    assert.throws(
      () => parseArgs(["--feature", "e", "--from", "d1:dev", "--to", "d1:dev"]),
      /the same/,
    );
  });

  it("names the features it knows", () => {
    assert.throws(() => featureFor("nope", { events: {} }), /Known: events\./);
    assert.throws(() => featureFor("nope", {}), /None can move yet/);
  });
});

describe("the menu feature", () => {
  it("copies record for record into D1", async () => {
    {
      const { menu } = FEATURES;
      assert.deepEqual([menu.role, menu.freeze], ["ops", true]);
      const source = memoryMenuRepository();
      const section = await source.create("menu_sections", {
        name: "Cocktails",
        slug: "cocktails",
      });
      const fall = await source.create("pos_menus", {
        name: "Fall 2026",
        isDefault: true,
      });
      const drink = await source.create("menu_items", {
        name: "Negroni",
        sectionId: section.id,
        posMenuIds: [fall.id],
      });
      const gin = await source.create("inventory", { name: "Gin", abv: "40" });
      await source.create("ingredients", {
        name: "Gin",
        itemId: drink.id,
        inventoryId: gin.id,
        quantity: 30,
        unit: "ml",
      });
      await source.create("menu_placements", {
        itemId: drink.id,
        channel: "pos",
        posMenuId: fall.id,
        posScreen: "Classic",
      });
      const lwc = await source.create("suppliers", { name: "LWC Drinks" });
      await source.create("inventory_suppliers", {
        name: "LWC Drinks",
        inventoryId: gin.id,
        supplierId: lwc.id,
        price: 19.5,
      });

      const db = createTestD1("ops");
      const { counts } = await moveFeature({
        source,
        target: menu.repository({ db }),
      });
      assert.deepEqual(counts, {
        menus: 0,
        menu_sections: 1,
        pos_menus: 1,
        menu_items: 1,
        menu_placements: 1,
        inventory: 1,
        ingredients: 1,
        suppliers: 1,
        inventory_suppliers: 1,
      });
      assert.deepEqual(
        (await menu.repository({ db }).get("menu_items", drink.id)).posMenuIds,
        [fall.id],
      );
    }
  });
});

describe("a copy out of production", () => {
  const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
  const PRODUCTION = {
    events: [
      {
        id: 7,
        name: "Epic Jam",
        slug: "epic-jam",
        driveFolderId: "production-folder",
        gallery: [
          { key: "original", asset: ASSET, date: "", added: "", source: "drive:production-file" },
          { key: "upload", asset: ASSET.replace("0a1b", "ffff"), date: "", added: "", source: "ops" },
        ],
      },
      { id: 8, name: "Quiz", slug: "quiz", driveFolderId: "" },
    ],
    nights: [
      {
        id: 70,
        eventId: "7",
        date: "2026-11-20",
        slug: "epic-jam-2026-11-20",
        sanityId: "event-epic-jam-2026-11-20",
        clickupTaskId: "production-task",
        googleCalendarEventId: "abc123|0123abcd",
      },
    ],
  };

  /** The events feature's own D1 repository, holding production's rows. */
  async function events(snapshot) {
    const repo = FEATURES.events.repository({ db: createTestD1("ops") });
    if (snapshot) await repo.importAll(snapshot);
    return repo;
  }

  const side = (text) => {
    const [kind, env] = text.split(":");
    return { kind, env };
  };

  it("into dev leaves behind what points at production's Drive and ClickUp, and says so", async () => {
    const lines = [];
    const target = await events();
    const result = await moveBetween({
      feature: FEATURES.events,
      from: side("d1:production"),
      to: side("d1:dev"),
      source: await events(PRODUCTION),
      target,
      log: (line) => lines.push(line),
    });
    const copy = await target.exportAll();
    // Deleting or renaming the series on dev would bin or rename the real folder.
    assert.deepEqual(copy.events.map((event) => event.driveFolderId), ["", ""]);
    // The Drive copy would move a "drive:" original out of production's folder.
    assert.deepEqual(copy.events[0].gallery.map((photo) => [photo.key, photo.source]), [
      ["original", "ops"],
      ["upload", "ops"],
    ]);
    assert.equal(copy.nights[0].clickupTaskId, "");
    // Dev has its own calendar and its own Sanity project: these stay.
    assert.equal(copy.nights[0].googleCalendarEventId, "abc123|0123abcd");
    assert.equal(copy.nights[0].sanityId, "event-epic-jam-2026-11-20");
    assert.equal(copy.events[0].name, "Epic Jam");
    assert.deepEqual(result.detached, {
      events: { driveFolderId: 1, gallery: 1 },
      nights: { clickupTaskId: 1 },
    });
    assert.ok(
      lines.includes(
        "left behind, as it points at production: driveFolderId of 1 events, gallery of 1 events, clickupTaskId of 1 nights",
      ),
      lines.join("\n"),
    );
    assert.equal(
      describeMove(result),
      "2 events, 1 nights; left behind, as it points at production: driveFolderId of 1 events, gallery of 1 events, clickupTaskId of 1 nights",
    );
  });

  it("into production, out of dev, carries everything", async () => {
    for (const [from, to] of [
      ["d1:dev", "d1:production"],
    ]) {
      const target = await events();
      const result = await moveBetween({
        feature: FEATURES.events,
        from: side(from),
        to: side(to),
        source: await events(PRODUCTION),
        target,
      });
      const copy = await target.exportAll();
      assert.equal(copy.events[0].driveFolderId, "production-folder", `${from} → ${to}`);
      assert.equal(copy.events[0].gallery[0].source, "drive:production-file");
      assert.equal(copy.nights[0].clickupTaskId, "production-task");
      assert.deepEqual(result.detached, {});
      assert.equal(describeMove(result), "2 events, 1 nights");
    }
  });
});

describe("the registry under plain Node", () => {
  it("loads, as data:move does (the test runner tolerates what Node rejects, e.g. a repeated import)", () => {
    const out = execFileSync(
      process.execPath,
      [
        "-e",
        "import('./scripts/lib/data-move/features.mjs').then((m) => console.log(Object.keys(m.FEATURES).join(',')))",
      ],
      { encoding: "utf8" },
    );
    assert.equal(out.trim(), "users,config,guests,artists,menu,events,venue,occasions");
  });
});
