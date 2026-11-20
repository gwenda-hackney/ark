/**
 * migrations/2026-11-20-pinsa-a-roma-email.mjs, run as a deploy runs it,
 * after 2026-11-19-pinsa-a-roma.mjs, against a D1 with the real schema and
 * Sanity, Calendar and Drive faked: the draft, a second run doing nothing,
 * no pop-up, and a dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1OneOffEmailRepository } from "../../ops/site/src/email/server/adapters/d1-one-off-email.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as pinsa from "../../migrations/2026-11-19-pinsa-a-roma.mjs";
import * as email from "../../migrations/2026-11-20-pinsa-a-roma-email.mjs";

describe("2026-11-20-pinsa-a-roma-email", () => {
  let world;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-20T12:00:00Z") });
    world = await createFakeWorld();
    world.install();
  });
  afterEach(() => {
    world.restore();
    vi.useRealTimers();
  });

  const run = async (migration, db, { dryRun = false } = {}) => {
    const lines = [];
    const result = await migration.up({ env: "dev", d1: () => db, processEnv: world.env, dryRun, log: (line) => lines.push(line) });
    return { text: lines.join("\n"), result };
  };
  const drafts = (db) => d1OneOffEmailRepository(db).list(50);

  it("drafts the email from the pop-up's template, once", async () => {
    const db = createTestD1("ops");
    await run(pinsa, db);

    const { text, result } = await run(email, db);

    const [made] = await drafts(db);
    assert.equal(result.drafted, true);
    assert.equal(made.status, "draft");
    assert.equal(made.createdBy, email.BY.toLowerCase());
    assert.equal(made.name, "Pinsa A Roma promo");
    assert.equal(made.subject, "Gwenda is teaming up with Pinsa A Roma! Mondays and Tuesdays");
    assert.deepEqual(
      made.sections.map((section) => section.kind),
      ["image", "row", "heading", "copy", "heading", "copy", "image", "button", "booking"],
    );
    assert.deepEqual(made.sections[1].cells.map((cell) => cell.kind), ["logo", "times", "picture"], "Gwenda × its logo, above its name");
    assert.match(made.sections[5].text, /\*\*Trastevere \(V\)\*\* £13\.50/);
    assert.equal(made.sections[7].link, "https://gwenda-web-dev.pages.dev/whats-on/pinsa-a-roma/");
    assert.match(text, /drafted "Gwenda is teaming up with Pinsa A Roma! Mondays and Tuesdays"/);

    const again = await run(email, db);
    assert.equal(again.result.drafted, false);
    assert.equal((await drafts(db)).length, 1, "not drafted twice");
    assert.match(again.text, /already promotes it; left as it is/);
  });

  it("does nothing without the pop-up", async () => {
    const db = createTestD1("ops");
    const { text, result } = await run(email, db);
    assert.equal(result.drafted, false);
    assert.equal((await drafts(db)).length, 0);
    assert.match(text, /there's no pop-up kitchen at \/whats-on\/pinsa-a-roma/);
  });

  it("dry run: says what it would draft and saves nothing", async () => {
    const db = createTestD1("ops");
    await run(pinsa, db);
    const { text } = await run(email, db, { dryRun: true });
    assert.equal((await drafts(db)).length, 0);
    assert.match(text, /would draft "Gwenda is teaming up with Pinsa A Roma!/);
  });
});
