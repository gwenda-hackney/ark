/**
 * migrations/2026-11-21-pinsa-a-roma-email-livelier.mjs, run as a deploy
 * runs it, after the pop-up and its first draft, against a D1 with the real
 * schema and Sanity, Calendar and Drive faked: the untouched draft made
 * livelier, one someone changed left alone, and a dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1OneOffEmailRepository } from "../../ops/site/src/email/server/adapters/d1-one-off-email.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as pinsa from "../../migrations/2026-11-19-pinsa-a-roma.mjs";
import * as drafted from "../../migrations/2026-11-20-pinsa-a-roma-email.mjs";
import * as livelier from "../../migrations/2026-11-21-pinsa-a-roma-email-livelier.mjs";

describe("2026-11-21-pinsa-a-roma-email-livelier", () => {
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
  const emails = (db) => d1OneOffEmailRepository(db);

  /** The pop-up, then its first draft, made the old way (as production has it). */
  async function withOldDraft(db) {
    await run(pinsa, db);
    await run(drafted, db);
    const [made] = await emails(db).list(5);
    return emails(db).updateDraft(
      made.id,
      { subject: "New at Gwenda: Pinsa A Roma, Mondays and Tuesdays", sections: made.sections.map((part, i) => (i === 1 ? { kind: "heading", text: "New at Gwenda: Pinsa A Roma" } : part)) },
      { by: drafted.BY },
    );
  }

  it("makes the untouched draft livelier, once", async () => {
    const db = createTestD1("ops");
    const old = await withOldDraft(db);

    const { text, result } = await run(livelier, db);

    const fresh = await emails(db).get(old.id);
    assert.equal(result.changed, true);
    assert.equal(fresh.status, "draft");
    assert.equal(fresh.subject, "Pinsa A Roma is coming to Gwenda! Mondays and Tuesdays");
    assert.equal(fresh.sections[1].text, "Pinsa A Roma is coming to Gwenda!");
    assert.ok(fresh.sections.some((part) => part.kind === "heading" && part.text === "What to order first"));
    assert.equal(fresh.updatedBy, livelier.BY.toLowerCase());
    assert.match(text, /made email \d+ livelier/);

    const again = await run(livelier, db);
    assert.equal(again.result.changed, false, "the second time it's no longer the first migration's draft");
  });

  it("leaves a draft someone has changed alone", async () => {
    const db = createTestD1("ops");
    const old = await withOldDraft(db);
    await emails(db).updateDraft(old.id, { name: "My pizza email" }, { by: "owner@example.com" });

    const { text, result } = await run(livelier, db);

    assert.equal(result.changed, false);
    assert.equal((await emails(db).get(old.id)).subject, "New at Gwenda: Pinsa A Roma, Mondays and Tuesdays");
    assert.match(text, /owner@example\.com changed it last, so it's theirs now/);
  });

  it("dry run: says what it would do and changes nothing", async () => {
    const db = createTestD1("ops");
    const old = await withOldDraft(db);
    const { text } = await run(livelier, db, { dryRun: true });
    assert.equal((await emails(db).get(old.id)).subject, "New at Gwenda: Pinsa A Roma, Mondays and Tuesdays");
    assert.match(text, /would make email \d+ livelier/);
  });
});
