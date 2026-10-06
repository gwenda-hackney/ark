import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import {
  DATABASES,
  ENVS,
  baserowDatabase,
  checkMigration,
  loadMigrations,
  openDatabase,
  runMigrations,
  sanityContent,
  selectMigrations,
  siteChanges,
} from "./migrations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** A fake Baserow: one table whose columns live in `columns`. */
function fakeBaserow(columns, { failCreate = null } = {}) {
  const calls = [];
  const request = async (_base, _jwt, path, init = {}) => {
    calls.push(`${init.method || "GET"} ${path}`);
    if (path === "/api/workspaces/") return [{ id: 1, name: "Gwenda" }, { id: 2, name: "Gwenda Dev" }];
    if (path === "/api/applications/workspace/2/") return [{ id: 900, type: "database", name: "Website" }];
    if (path === "/api/applications/workspace/1/") {
      return [
        { id: 461843, type: "database", name: "Website" },
      ];
    }
    if (path.startsWith("/api/database/tables/database/")) return [{ id: 42, name: "Form Submissions" }];
    if (path === "/api/database/fields/table/42/" && init.method === "POST") {
      if (failCreate) {
        failCreate(columns);
        throw new Error("POST → 400: field name already exists");
      }
      columns.push({ id: columns.length + 1, ...JSON.parse(init.body) });
      return {};
    }
    if (path === "/api/database/fields/table/42/") return columns.map((c) => ({ ...c }));
    if (path.startsWith("/api/database/fields/") && init.method === "PATCH") {
      const id = Number(path.split("/")[4]);
      Object.assign(columns.find((c) => c.id === id), JSON.parse(init.body));
      return {};
    }
    if (path.startsWith("/api/database/fields/") && init.method === "DELETE") {
      const id = Number(path.split("/")[4]);
      columns.splice(columns.findIndex((c) => c.id === id), 1);
      return null;
    }
    throw new Error(`unexpected ${path}`);
  };
  return { request, calls };
}

const db = (columns, opts) => {
  const fake = fakeBaserow(columns, opts);
  return {
    fake,
    database: baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Website", request: fake.request }),
  };
};

describe("baserowDatabase", () => {
  it("adds a missing column once", async () => {
    const columns = [{ id: 1, name: "Form Slug" }];
    const { database } = db(columns);
    assert.equal(await database.ensureField("Form Submissions", { name: "Edit Link", type: "url" }), "created");
    assert.equal(await database.ensureField("Form Submissions", { name: "Edit Link", type: "url" }), "exists");
    assert.deepEqual(columns.map((c) => c.name), ["Form Slug", "Edit Link"]);
  });

  it("counts a column another deploy just added as done", async () => {
    const columns = [];
    const { database } = db(columns, { failCreate: (cols) => cols.push({ id: 9, name: "Edit Link" }) });
    assert.equal(await database.ensureField("Form Submissions", { name: "Edit Link", type: "url" }), "exists");
  });

  it("still fails when the column could not be added", async () => {
    const { database } = db([], { failCreate: () => {} });
    await assert.rejects(database.ensureField("Form Submissions", { name: "Edit Link" }), /400/);
  });

  it("removes a column only if it's there", async () => {
    const columns = [{ id: 3, name: "Old" }];
    const { database } = db(columns);
    assert.equal(await database.removeField("Form Submissions", "Old"), "removed");
    assert.equal(await database.removeField("Form Submissions", "Old"), "absent");
  });

  it("adds a choice to a single-select column once", async () => {
    const columns = [{ id: 4, name: "Env", select_options: [{ id: 1, value: "dev" }] }];
    const { database } = db(columns);
    assert.equal(await database.ensureSelectOption("Form Submissions", "Env", "preview"), "created");
    assert.equal(await database.ensureSelectOption("Form Submissions", "Env", "preview"), "exists");
    assert.deepEqual(columns[0].select_options.map((o) => o.value), ["dev", "preview"]);
  });

  it("adds a table with just its key column, once", async () => {
    const created = [];
    const request = async (_base, _jwt, path, init = {}) => {
      if (path === "/api/database/tables/database/7/" && init.method === "POST") {
        const body = JSON.parse(init.body);
        created.push(body);
        return { id: 50, name: body.name };
      }
      if (path === "/api/database/tables/database/7/") return [{ id: 42, name: "Form Submissions" }];
      throw new Error(`unexpected ${path}`);
    };
    const database = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Ops", request });
    assert.equal(await database.ensureTable("Guest artists", "Email"), "created");
    assert.equal(await database.ensureTable("Guest artists", "Email"), "exists");
    assert.equal(await database.ensureTable("Form Submissions", "Email"), "exists");
    assert.deepEqual(created, [{ name: "Guest artists", data: [["Email"]], first_row_header: true }]);
  });

  it("removes a table once, and only that one", async () => {
    const deleted = [];
    const request = async (_base, _jwt, path, init = {}) => {
      if (init.method === "DELETE") {
        deleted.push(path);
        return null;
      }
      if (path === "/api/database/tables/database/7/") {
        return [
          { id: 42, name: "Subscribers" },
          { id: 43, name: "Subscribe sync runs" },
        ];
      }
      throw new Error(`unexpected ${path}`);
    };
    const database = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Website", request });
    assert.equal(await database.removeTable("Subscribe sync runs"), "removed");
    assert.equal(await database.removeTable("Subscribe sync runs"), "absent");
    assert.deepEqual(deleted, ["/api/database/tables/43/"]);
  });

  it("removing the sync runs table never runs outside production", async () => {
    const [migration] = (await loadMigrations(resolve(ROOT, "migrations"))).filter(
      (m) => m.name === "2026-10-03-remove-sync-runs-table.mjs",
    );
    const lines = [];
    // No database: it would throw if it tried to open one.
    await migration.up({ env: "dev", database: null, log: (line) => lines.push(line) });
    assert.deepEqual(lines, ["production only"]);
  });

  it("names a missing table", async () => {
    const { database } = db([]);
    await assert.rejects(database.fields("Nope"), /Website: table "Nope" not found/);
  });
});

describe("openDatabase", () => {
  it("finds each environment's own database", async () => {
    const { request } = fakeBaserow([]);
    const dev = await openDatabase({ apiBase: "x", jwt: "j", key: "website", env: "dev", request });
    assert.equal(dev.label, "Gwenda Dev / Website");
    const production = await openDatabase({ apiBase: "x", jwt: "j", key: "website", env: "production", request });
    assert.equal(production.label, "Gwenda / Website");
  });

  it("refuses a database an environment doesn't have", async () => {
    await assert.rejects(openDatabase({ key: "ops", env: "staging" }), /no ops database in staging/);
    await assert.rejects(openDatabase({ key: "website", env: "staging" }), /no website database in staging/);
  });

  it("maps every environment for each database, each in its own workspace", () => {
    for (const key of ["website", "ops", "config"]) {
      assert.deepEqual(Object.keys(DATABASES[key]), ENVS);
      assert.notEqual(DATABASES[key].dev[0], DATABASES[key].production[0]);
    }
  });
});

describe("migrations", () => {
  const up = async () => {};

  it("rejects a migration missing its exports", () => {
    assert.throws(() => checkMigration("x.mjs", { app: "web", phase: "during", up }), /phase.*about/);
  });

  it("runs only this app's migrations for this phase, in order", async () => {
    const ran = [];
    const make = (name, app, phase) =>
      checkMigration(name, { app, phase, about: name, up: async () => ran.push(name) });
    const all = [make("1.mjs", "web", "pre"), make("2.mjs", "ops", "pre"), make("3.mjs", "web", "post"), make("4.mjs", "web", "pre")];
    await runMigrations(selectMigrations(all, { app: "web", phase: "pre" }), {
      env: "dev",
      database: async () => null,
      log: () => {},
    });
    assert.deepEqual(ran, ["1.mjs", "4.mjs"]);
  });

  it("asks for a website rebuild only when a migration changed what the build reads", async () => {
    const site = siteChanges();
    const make = (name, up) => checkMigration(name, { app: "web", phase: "post", about: name, up });
    const run = (list) => runMigrations(list, { env: "dev", database: async () => null, site, log: () => {} });
    assert.equal((await run([make("1.mjs", async () => {})])).rebuild, false);
    const result = await run([make("2.mjs", async () => site.note("series-x"))]);
    assert.deepEqual(result, { rebuild: true, changes: ["series-x"] });
  });

  it("notes Sanity changes to published documents or by query, not drafts", async () => {
    const sent = [];
    const request = async (url, init = {}) => {
      if (init.method === "POST") sent.push(JSON.parse(init.body).mutations);
      return { ok: true, json: async () => ({ result: url.includes("%24slug=%22play%22") ? "found" : null }) };
    };
    const site = siteChanges();
    const content = sanityContent({ env: "dev", processEnv: { SANITY_API_TOKEN: "t" }, site, request });
    assert.equal(content.project, "gwscpagy");
    assert.equal(await content.query("*[slug.current == $slug]", { slug: "play" }), "found");
    await content.mutate([{ patch: { id: "drafts.series-a", set: { x: 1 } } }]);
    assert.equal(site.rebuild, false);
    await content.mutate([{ patch: { id: "series-a", set: { x: 1 } } }]);
    await content.mutate([{ delete: { query: "*[_type == 'old']" } }]);
    await content.mutate([]);
    assert.deepEqual(site.changes, ["gwscpagy: series-a", "gwscpagy: documents by query"]);
    assert.equal(sent.length, 3);
  });

  it("notes Baserow row changes only in the tables the website build reads", async () => {
    const request = async (_base, _jwt, path) => {
      if (path === "/api/database/tables/database/7/") return [{ id: 1, name: "Artists" }, { id: 2, name: "Events" }];
      return {};
    };
    const site = siteChanges();
    const ops = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Ops", key: "ops", site, request });
    await ops.updateRows("Events", [{ id: 1, Name: "x" }]);
    assert.equal(site.rebuild, false);
    await ops.updateRows("Artists", [{ id: 1, Name: "x" }]);
    assert.deepEqual(site.changes, ["Ops: Artists"]);
    const website = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Web", key: "website", site, request });
    await website.updateRows("Artists", [{ id: 1 }]);
    assert.equal(site.changes.length, 1);
  });

  it("every file in migrations/ is a valid migration", async () => {
    const loaded = await loadMigrations(resolve(ROOT, "migrations"));
    assert.ok(loaded.length > 0);
  });

  it("removing dev's rows never runs outside production", async () => {
    const [cleanup] = (await loadMigrations(resolve(ROOT, "migrations"))).filter(
      (m) => m.name === "2026-10-02-config-dev-rows.mjs",
    );
    const lines = [];
    // No config token: it would throw if it tried to touch the database.
    await cleanup.up({ env: "dev", processEnv: {}, log: (line) => lines.push(line) });
    assert.deepEqual(lines, ["production only"]);
  });
});

describe("2026-10-04-menu-prices-column", () => {
  it("adds the Menu Items Prices column before the ops deploy, once", async () => {
    const [migration] = (await loadMigrations(resolve(ROOT, "migrations"))).filter(
      (m) => m.name === "2026-10-04-menu-prices-column.mjs",
    );
    assert.equal(migration.app, "ops");
    assert.equal(migration.phase, "pre");
    const columns = [{ id: 1, name: "Price" }];
    const request = async (_base, _jwt, path, init = {}) => {
      if (path === "/api/database/tables/database/7/") return [{ id: 42, name: "Menu Items" }];
      if (path === "/api/database/fields/table/42/" && init.method === "POST") {
        columns.push({ id: columns.length + 1, ...JSON.parse(init.body) });
        return {};
      }
      if (path === "/api/database/fields/table/42/") return columns.map((c) => ({ ...c }));
      throw new Error("unexpected " + path);
    };
    const ops = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Ops", request });
    const lines = [];
    const run = () =>
      migration.up({
        env: "dev",
        database: async (key) => {
          assert.equal(key, "ops");
          return ops;
        },
        log: (line) => lines.push(line),
      });
    await run();
    await run();
    assert.deepEqual(columns, [
      { id: 1, name: "Price" },
      { id: 2, name: "Prices", type: "long_text" },
    ]);
    assert.deepEqual(lines, ["Ops: Prices created", "Ops: Prices exists"]);
  });
});

describe("Events: Taking applications migration (#41)", () => {
  const fakeOps = (result, rows) => {
    const updated = [];
    return {
      updated,
      db: {
        label: "Gwenda / Ops",
        ensureField: async () => result,
        rows: async () => rows,
        updateRows: async (_table, items) => updated.push(...items),
      },
    };
  };
  const rows = [
    { id: 1, Name: "Negroni Chess Society test", "Repeat unit": { value: "week" } },
    { id: 2, Name: "Gwenda + Live", "Repeat unit": { value: "none" } },
    { id: 3, Name: "Gwenda Selects", "Repeat unit": { value: "week" } },
    { id: 4, Name: "Friday, With Guests", "Repeat unit": { value: "week" } },
    { id: 5, Name: "Radio Gwenda", "Repeat unit": { value: "week" } },
    { id: 6, Name: "The Jazz Room", "Repeat unit": { value: "week" } },
    { id: 7, Name: "Happy Hour", "Repeat unit": { value: "week" } },
    { id: 8, Name: "Radio Gwenda", "Repeat unit": { value: "week" }, "Deleted at": "2026-10-01" },
    { id: 9, Name: "Gwenda Selects", "Repeat unit": { value: "once" } },
  ];

  it("switches on the five play-form series when it adds the column", async () => {
    const { up } = await import("../../migrations/2026-10-04-events-taking-applications.mjs");
    const { db, updated } = fakeOps("created", rows);
    await up({ database: async () => db, log: () => {} });
    assert.deepEqual(updated.map((item) => item.id), [1, 2, 3, 4, 5]);
    assert.ok(updated.every((item) => item["Taking applications"] === true));
  });

  it("leaves rows alone once the column exists", async () => {
    const { up } = await import("../../migrations/2026-10-04-events-taking-applications.mjs");
    const { db, updated } = fakeOps("exists", rows);
    await up({ database: async () => db, log: () => {} });
    assert.deepEqual(updated, []);
  });
});

describe("series taking applications onto Sanity", () => {
  it("takes the live series ops marks, not deleted rows or one-offs", async () => {
    const { seriesTakingApplications } = await import(
      "../../migrations/2026-10-04-series-taking-applications-sanity.mjs"
    );
    const rows = [
      { Name: "Gwenda Selects", "Taking applications": true, "Repeat unit": { value: "week" } },
      { Name: "Happy Hour", "Taking applications": false, "Repeat unit": { value: "week" } },
      { Name: "Radio Gwenda", "Taking applications": true, "Deleted at": "2026-10-01" },
      { Name: "Launch", "Taking applications": true, "Repeat unit": { value: "once" } },
      { Name: "Old row" },
    ];
    assert.deepEqual(seriesTakingApplications(rows).map((row) => row.Name), ["Gwenda Selects"]);
  });

  it("matches published series and drafts by web address or name, skipping ones already on", async () => {
    const { seriesIdsToSwitchOn } = await import(
      "../../migrations/2026-10-04-series-taking-applications-sanity.mjs"
    );
    const rows = [
      { Name: "Gwenda + Live", Slug: "gwenda-nights" },
      { Name: "Friday, With Guests", Slug: "" },
      { Name: "Radio Gwenda", Slug: "gwenda-radio" },
    ];
    const documents = [
      { _id: "series-gwenda-nights", title: "Gwenda + Live", slug: "gwenda-nights" },
      { _id: "drafts.series-gwenda-nights", title: "Gwenda + Live", slug: "gwenda-nights" },
      { _id: "series-music-friday", title: "Friday, With Guests", slug: "music-friday" },
      { _id: "series-gwenda-radio", title: "Radio Gwenda", slug: "gwenda-radio", takingApplications: true },
      { _id: "series-happy-houre", title: "HAPPY HOURE", slug: "happy-houre" },
    ];
    assert.deepEqual(seriesIdsToSwitchOn(rows, documents), [
      "series-gwenda-nights",
      "drafts.series-gwenda-nights",
      "series-music-friday",
    ]);
  });
});

describe("event photos from before #183", () => {
  const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
  const events = [
    { id: 1, Name: "Jazz", "Main image": [{ name: "abc_jazz.jpg", url: "https://files/abc_jazz.jpg" }], Gallery: "" },
    { id: 2, Name: "Chess", "Main image": [{ name: "x.jpg", url: "u" }], "Hero asset": ASSET, Gallery: "[]" },
    { id: 3, Name: "Quiz", "Main image": [], Gallery: "", "Drive folder id": "" },
    { id: 4, Name: "", Gallery: "" },
  ];
  const nights = [
    { id: 10, Name: "Jazz · 2026-10-08", "Override image": [{ name: "def_guest.jpg", url: "https://files/def_guest.jpg" }] },
    { id: 11, Name: "Jazz · 2026-10-15", "Override image": [] },
  ];

  /** Ops tables and Sanity, recording writes and uploads. */
  function world() {
    const updated = [];
    const uploads = [];
    const db = {
      label: "Gwenda Dev / Gwenda Ops",
      rows: async (table) => (table === "Events" ? events : nights),
      updateRows: async (table, items) => updated.push(...items.map((item) => ({ table, ...item }))),
    };
    const content = {
      query: async () => [
        { _id: ASSET, originalFilename: "ops-abc_jazz.jpg" },
        { _id: ASSET, originalFilename: "ops-def_guest.jpg" },
      ],
      uploadImage: async (_bytes, meta) => {
        uploads.push(meta.filename);
        return { _id: ASSET };
      },
    };
    return { updated, uploads, database: async () => db, sanity: () => content };
  }

  it("plans only what hasn't moved", async () => {
    const { planImageBackfill } = await import("../../migrations/2026-10-05-event-images-backfill.mjs");
    const plan = planImageBackfill({ events, nights });
    assert.deepEqual(plan.heroes.map((item) => item.id), [1]);
    assert.deepEqual(plan.flyers.map((item) => item.id), [10]);
    assert.deepEqual(plan.galleries.map((item) => item.id), [1, 3], "an empty Gallery is still in Drive; [] has moved");
  });

  it("turns Drive files into gallery photos, newest first, keeping their ids and nights", async () => {
    const { galleryFromDrive } = await import("../../migrations/2026-10-05-event-images-backfill.mjs");
    const files = [
      { id: "d2", date: "2026-10-08", createdTime: "2026-10-09T10:00:00Z" },
      { id: "d1", date: "", createdTime: "2026-10-01T10:00:00Z" },
      { id: "d0", date: "" },
    ];
    assert.deepEqual(galleryFromDrive(files, new Map([["d2", "a2"], ["d1", "a1"]])), [
      { key: "d2", asset: "a2", date: "2026-10-08", added: "2026-10-09T10:00:00Z", source: "drive:d2" },
      { key: "d1", asset: "a1", date: "", added: "2026-10-01T10:00:00Z", source: "drive:d1" },
    ]);
  });

  it("a dry run changes nothing", async () => {
    const { up } = await import("../../migrations/2026-10-05-event-images-backfill.mjs");
    const { updated, uploads, database, sanity } = world();
    const lines = [];
    await up({ env: "dev", processEnv: {}, database, sanity, log: (line) => lines.push(line), dryRun: true });
    assert.deepEqual(updated, []);
    assert.deepEqual(uploads, []);
    assert.ok(lines.some((line) => /1 main images, 1 flyers, 2 galleries/.test(line)));
  });

  it("reuses the assets ops copied before, and moves a gallery without a Drive folder as empty", async () => {
    const { up } = await import("../../migrations/2026-10-05-event-images-backfill.mjs");
    const { updated, uploads, database, sanity } = world();
    await up({ env: "dev", processEnv: {}, database, sanity, log: () => {} });
    assert.deepEqual(uploads, [], "both were in Sanity already");
    assert.deepEqual(updated, [
      { table: "Events", id: 1, "Hero asset": ASSET },
      { table: "Event dates", id: 10, "Override asset": ASSET },
      { table: "Events", id: 1, Gallery: "[]" },
      { table: "Events", id: 3, Gallery: "[]" },
    ]);
  });
});

describe("artist photos from before #183", () => {
  const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
  const NEW = "image-ffffffffffffffffffffffffffffffffffffffff-400x400-png";
  const file = (name) => ({ name, visible_name: `${name} shown`, url: `https://files/${name}` });
  const rows = [
    { id: 1, Name: "Ada", Portrait: [file("face.jpg")], Art: [file("a.jpg"), file("b.png")], "Gwenda photos": [] },
    {
      id: 2,
      Name: "Bea",
      Portrait: [file("old.jpg")],
      "Portrait asset": ASSET,
      Art: [file("c.jpg")],
      "Art assets": "[]",
      "Gwenda assets": JSON.stringify([{ asset: ASSET, label: "x" }]),
    },
  ];

  function world() {
    const updated = [];
    const uploads = [];
    const db = {
      label: "Gwenda Dev / Gwenda Ops",
      rows: async () => rows,
      updateRows: async (table, items) => updated.push(...items.map((item) => ({ table, ...item }))),
    };
    const content = {
      query: async (_groq, { names }) =>
        names.includes("artist-face.jpg") ? [{ _id: ASSET, originalFilename: "artist-face.jpg" }] : [],
      uploadImage: async (_bytes, meta) => {
        uploads.push(meta.filename);
        return { _id: NEW };
      },
    };
    return { updated, uploads, database: async () => db, sanity: () => content };
  }

  it("plans only what hasn't moved", async () => {
    const { planArtistBackfill } = await import("../../migrations/2026-10-06-artist-images-backfill.mjs");
    const plan = planArtistBackfill(rows);
    assert.deepEqual(
      plan.map((item) => [item.id, Object.keys(item.columns), item.photos]),
      [[1, ["Portrait asset", "Art assets", "Gwenda assets"], 3]],
    );
  });

  it("a dry run changes nothing", async () => {
    const { up } = await import("../../migrations/2026-10-06-artist-images-backfill.mjs");
    const { updated, uploads, database, sanity } = world();
    const lines = [];
    await up({ database, sanity, log: (line) => lines.push(line), dryRun: true });
    assert.deepEqual(updated, []);
    assert.deepEqual(uploads, []);
    assert.ok(lines.some((line) => /1 artists, 3 photos to move/.test(line)));
  });

  it("reuses a photo already in Sanity, uploads the rest in order, and marks empty lists moved", async () => {
    const { up } = await import("../../migrations/2026-10-06-artist-images-backfill.mjs");
    const { updated, uploads, database, sanity } = world();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }));
    try {
      await up({ database, sanity, log: () => {} });
    } finally {
      fetchMock.mockRestore();
    }
    assert.deepEqual(uploads, ["artist-a.jpg", "artist-b.png"]);
    assert.deepEqual(updated, [
      {
        table: "Artists",
        id: 1,
        "Portrait asset": ASSET,
        "Art assets": JSON.stringify([
          { asset: NEW, label: "a.jpg shown" },
          { asset: NEW, label: "b.png shown" },
        ]),
        "Gwenda assets": "[]",
      },
    ]);
  });
});

describe("running one migration as a dry run", () => {
  it("passes dryRun to the migration", async () => {
    let seen = null;
    await runMigrations([{ name: "x.mjs", about: "x", up: ({ dryRun }) => (seen = dryRun) }], {
      env: "dev",
      processEnv: {},
      log: () => {},
      dryRun: true,
    });
    assert.equal(seen, true);
  });
});

describe("smoke-test-cleanup", () => {
  const load = async () =>
    (await loadMigrations(resolve(ROOT, "migrations"))).find((m) => m.name === "smoke-test-cleanup.mjs");

  function website(rows) {
    const deleted = [];
    const request = async (_base, _jwt, path, init = {}) => {
      if (path === "/api/database/tables/database/3/") return [{ id: 55, name: "Subscribers" }];
      if (path.startsWith("/api/database/rows/table/55/?")) return { results: rows, next: null };
      if (path === "/api/database/rows/table/55/batch-delete/" && init.method === "POST") {
        deleted.push(...JSON.parse(init.body).items);
        return null;
      }
      throw new Error("unexpected " + path);
    };
    return { db: baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 3, label: "Website", request }), deleted };
  }

  it("runs after the web deploy, so after its smoke test", async () => {
    const migration = await load();
    assert.equal(migration.app, "web");
    assert.equal(migration.phase, "post");
  });

  it("removes only the test sign-up, and skips Mailchimp without a key", async () => {
    const { db, deleted } = website([
      { id: 1, Email: "guest@example.com" },
      { id: 2, Email: "Alerts+Signup-Smoke@gwenda.co.uk" },
    ]);
    const lines = [];
    await (await load()).up({ database: async () => db, processEnv: {}, log: (line) => lines.push(line) });
    assert.deepEqual(deleted, [2]);
    assert.deepEqual(lines, ["Subscribers: removed 1 test row(s)", "Mailchimp: no key here (production only); skipped"]);
  });

  it("only reports on a dry run", async () => {
    const { db, deleted } = website([{ id: 2, Email: "alerts+signup-smoke@gwenda.co.uk" }]);
    const lines = [];
    await (await load()).up({ database: async () => db, processEnv: {}, dryRun: true, log: (line) => lines.push(line) });
    assert.deepEqual(deleted, []);
    assert.equal(lines[0], "Subscribers: would remove 1 test row(s)");
    const { archiveSmokeMember } = await import("../../migrations/smoke-test-cleanup.mjs");
    const methods = [];
    const fetchImpl = async (_url, init = {}) => {
      methods.push(init.method || "GET");
      return Response.json({ status: "subscribed" });
    };
    assert.equal(await archiveSmokeMember("key-us21", { fetchImpl, dryRun: true }), "would archive (is subscribed)");
    assert.deepEqual(methods, ["GET"]);
  });

  it("removes the test sign-up from D1 once subscribers live there", async () => {
    const db = createTestD1("website");
    db.exec(`INSERT INTO _meta (key, value) VALUES ('store:guests', 'd1');
      INSERT INTO subscribers (email, tags) VALUES ('guest@example.com', '[]'), ('Alerts+Signup-Smoke@gwenda.co.uk', '[]');`);
    const lines = [];
    const database = async () => {
      throw new Error("Baserow is not used once guests are on D1");
    };
    await (await load()).up({ database, d1: () => db, processEnv: {}, log: (line) => lines.push(line) });
    assert.equal(lines[0], "Subscribers: removed 1 test row(s)");
    assert.deepEqual(
      (await db.prepare("SELECT email FROM subscribers").all()).results.map((row) => row.email),
      ["guest@example.com"],
    );
  });

  it("archives the test address in Mailchimp only when it's there", async () => {
    const { archiveSmokeMember } = await import("../../migrations/smoke-test-cleanup.mjs");
    const calls = [];
    const mailchimp = (status) => async (url, init = {}) => {
      calls.push([init.method || "GET", url]);
      if (status === null) return new Response("{}", { status: 404 });
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ status });
    };
    assert.equal(await archiveSmokeMember("key-us21", { fetchImpl: mailchimp(null) }), "not on the list");
    assert.equal(await archiveSmokeMember("key-us21", { fetchImpl: mailchimp("archived") }), "already archived");
    calls.length = 0;
    assert.equal(await archiveSmokeMember("key-us21", { fetchImpl: mailchimp("subscribed") }), "archived (was subscribed)");
    assert.deepEqual(
      calls.map(([method, url]) => [method, url.replace(/[0-9a-f]{32}$/, "<hash>")]),
      [
        ["GET", "https://us21.api.mailchimp.com/3.0/lists/e2c69d5d31/members/<hash>"],
        ["DELETE", "https://us21.api.mailchimp.com/3.0/lists/e2c69d5d31/members/<hash>"],
      ],
    );
  });
});
