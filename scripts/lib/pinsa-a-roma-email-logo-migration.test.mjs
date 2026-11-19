/**
 * migrations/2026-11-22-pinsa-a-roma-email-logo.mjs, run as a deploy runs it,
 * after the pop-up, its first draft and the livelier one, against a D1 with
 * the real schema and Sanity, Calendar and Drive faked: the untouched draft
 * gets the logo, one someone changed is left alone, and a dry run.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { d1OneOffEmailRepository } from "../../ops/site/src/email/server/adapters/d1-one-off-email.js";
import { createFakeWorld } from "../../ops/site/src/testing/fake-world.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import * as pinsa from "../../migrations/2026-11-19-pinsa-a-roma.mjs";
import * as drafted from "../../migrations/2026-11-20-pinsa-a-roma-email.mjs";
import * as livelier from "../../migrations/2026-11-21-pinsa-a-roma-email-livelier.mjs";
import * as withLogo from "../../migrations/2026-11-22-pinsa-a-roma-email-logo.mjs";

describe("2026-11-22-pinsa-a-roma-email-logo", () => {
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
  const logoOf = (email) => email.sections.find((part) => part.kind === "image" && part.size === "collab");

  /** The livelier draft without the logo, as production has it. */
  async function withLivelyDraft(db) {
    await run(pinsa, db);
    await run(drafted, db);
    const [made] = await emails(db).list(5);
    const { sections } = await emails(db).get(made.id);
    return emails(db).updateDraft(
      made.id,
      { sections: sections.filter((part) => part.size !== "collab"), subject: made.subject },
      { by: livelier.BY },
    );
  }

  it("gives the untouched draft the pop-up's logo above its name, once", async () => {
    const db = createTestD1("ops");
    const old = await withLivelyDraft(db);
    assert.equal(logoOf(old), undefined);

    const { text, result } = await run(withLogo, db);

    const fresh = await emails(db).get(old.id);
    assert.equal(result.changed, true);
    const at = fresh.sections.indexOf(logoOf(fresh));
    assert.ok(at >= 0, "the logo is in it");
    assert.equal(fresh.sections[at].alt, "Pinsa A Roma");
    assert.deepEqual(fresh.sections[at + 1], { kind: "heading", text: "Pinsa A Roma is coming to Gwenda!" });
    assert.equal(fresh.updatedBy, withLogo.BY.toLowerCase());
    assert.match(text, /added the logo to email \d+/);

    assert.equal((await run(withLogo, db)).result.changed, false, "the second time it's no longer the livelier draft");
  });

  it("leaves a draft someone has changed alone", async () => {
    const db = createTestD1("ops");
    const old = await withLivelyDraft(db);
    await emails(db).updateDraft(old.id, { name: "My pizza email" }, { by: "owner@example.com" });

    const { text, result } = await run(withLogo, db);

    assert.equal(result.changed, false);
    assert.equal(logoOf(await emails(db).get(old.id)), undefined);
    assert.match(text, /owner@example\.com changed it last, so it's theirs now/);
  });

  it("dry run: says what it would do and changes nothing", async () => {
    const db = createTestD1("ops");
    const old = await withLivelyDraft(db);
    const { text } = await run(withLogo, db, { dryRun: true });
    assert.equal(logoOf(await emails(db).get(old.id)), undefined);
    assert.match(text, /would add the logo to email \d+/);
  });
});
