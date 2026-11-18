import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import { all } from "../../shared/d1.js";
import {
  checkMigration,
  loadMigrations,
  runMigrations,
  sanityContent,
  selectMigrations,
  siteChanges,
} from "./migrations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
      log: () => {},
    });
    assert.deepEqual(ran, ["1.mjs", "4.mjs"]);
  });

  it("asks for a website rebuild only when a migration changed what the build reads", async () => {
    const site = siteChanges();
    const make = (name, up) => checkMigration(name, { app: "web", phase: "post", about: name, up });
    const run = (list) => runMigrations(list, { env: "dev", site, log: () => {} });
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

  /** The website D1 database with these subscribers. */
  function website(emails) {
    const db = createTestD1("website");
    for (const email of emails) db.prepare("INSERT INTO subscribers (email, tags) VALUES (?, '[]')").bind(email).run();
    const emailsLeft = async () => (await all(db, "SELECT email FROM subscribers ORDER BY id")).map((row) => row.email);
    return { d1: () => db, emailsLeft };
  }

  it("runs after the web deploy, so after its smoke test", async () => {
    const migration = await load();
    assert.equal(migration.app, "web");
    assert.equal(migration.phase, "post");
  });

  it("removes only the test sign-up, and skips Mailchimp without a key", async () => {
    const { d1, emailsLeft } = website(["guest@example.com", "Alerts+Signup-Smoke@gwenda.co.uk"]);
    const lines = [];
    await (await load()).up({ d1, processEnv: {}, log: (line) => lines.push(line) });
    assert.deepEqual(await emailsLeft(), ["guest@example.com"]);
    assert.deepEqual(lines, ["Subscribers: removed 1 test row(s)", "Mailchimp: no key here (production only); skipped"]);
  });

  it("only reports on a dry run", async () => {
    const { d1, emailsLeft } = website(["alerts+signup-smoke@gwenda.co.uk"]);
    const lines = [];
    await (await load()).up({ d1, processEnv: {}, dryRun: true, log: (line) => lines.push(line) });
    assert.deepEqual(await emailsLeft(), ["alerts+signup-smoke@gwenda.co.uk"]);
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

describe("2026-10-20-description-entities", () => {
  const load = () => import("../../migrations/2026-10-20-description-entities.mjs");

  it("decodes the editor's entities once", async () => {
    const { decodeEntities } = await load();
    assert.equal(decodeEntities("Q&amp;A, Beats &amp; Samples, 3 &lt; 4, Gwenda&#39;s"), "Q&A, Beats & Samples, 3 < 4, Gwenda's");
    assert.equal(decodeEntities("&amp;lt;"), "&lt;");
  });

  it("fixes ops events, night overrides and the Sanity documents, and leaves clean ones alone", async () => {
    const { up } = await load();
    const db = createTestD1("ops");
    db.exec(`INSERT INTO events (id, name, description) VALUES
        (1, 'EPIC Jam', 'A Q&amp;A and a Beats &amp; Samples competition.'),
        (2, 'Radio Gwenda', 'Records & radio.');
      INSERT INTO event_dates (id, event_id, date, overrides) VALUES
        (10, 1, '2026-11-22', '{"description":"Lebanese &amp; British"}'),
        (11, 2, '2026-11-23', '{"description":"R&B"}');`);
    const documents = [
      {
        _id: "series-epic-jam",
        title: "EPIC Jam",
        description: [{ _type: "block", _key: "p0", markDefs: [], children: [{ _type: "span", _key: "s0", marks: [], text: "A Q&amp;A" }] }],
      },
      { _id: "drafts.event-radio", title: "Radio Gwenda", description: [] },
    ];
    const mutations = [];
    const sanity = () => ({
      project: "test",
      query: async () => documents,
      mutate: async (list) => mutations.push(...list),
    });
    const lines = [];

    await up({ d1: async () => db, sanity, log: (line) => lines.push(line), dryRun: true });
    assert.equal(mutations.length, 0);
    assert.equal((await all(db, "SELECT description FROM events WHERE id = 1"))[0].description, "A Q&amp;A and a Beats &amp; Samples competition.");

    await up({ d1: async () => db, sanity, log: (line) => lines.push(line) });
    const events = await all(db, "SELECT id, description FROM events ORDER BY id");
    assert.deepEqual(events.map((row) => row.description), ["A Q&A and a Beats & Samples competition.", "Records & radio."]);
    const nights = await all(db, "SELECT id, overrides FROM event_dates ORDER BY id");
    assert.deepEqual(nights.map((row) => JSON.parse(row.overrides).description), ["Lebanese & British", "R&B"]);
    assert.deepEqual(mutations, [
      {
        patch: {
          id: "series-epic-jam",
          set: {
            description: [{ _type: "block", _key: "p0", markDefs: [], children: [{ _type: "span", _key: "s0", marks: [], text: "A Q&A" }] }],
          },
        },
      },
    ]);
    assert.match(lines[0], /1 events \(EPIC Jam\), 1 nights/);
  });
});
