/**
 * What every WeeklyEmailRepository adapter must do (#186): the same cases on
 * memory and D1 (SQLite with the real migrations), plus the copy between
 * them. The claims and moves here are what make a week's email go out once.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { d1WeeklyEmailRepository } from "./adapters/d1-weekly-email.js";
import { memoryWeeklyEmailRepository } from "./adapters/memory-weekly-email.js";
import { weeklyEmailRepository } from "./weekly-email-repository.js";

const ADAPTERS = {
  memory: () => memoryWeeklyEmailRepository(),
  d1: () => d1WeeklyEmailRepository(createTestD1("ops")),
};

const NOW = new Date("2026-11-10T10:05:00Z");
const LATER = new Date("2026-11-10T10:06:00Z");
const WEEK = "2026-11-09";

repositoryContract("WeeklyEmailRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    const run = await repo.claim({ weekStart: WEEK, now: NOW });
    await repo.move(run.id, ["preparing"], "sent", { subject: "This week", recipients: 244, sentAt: NOW.toISOString() }, NOW);
    await repo.claim({ weekStart: WEEK, attempt: 2, startedBy: "manual", now: LATER });
    await repo.logTest({ email: "someone@example.com", sentAt: NOW.toISOString() });
  },
  cases: {
    "claims a week once: the second claim gets nothing": async (repo) => {
      const run = await repo.claim({ weekStart: WEEK, now: NOW });
      assert.deepEqual(run, {
        id: run.id,
        weekStart: WEEK,
        attempt: 1,
        status: "preparing",
        startedBy: "schedule",
        subject: "",
        preheader: "",
        campaignId: "",
        campaignWebId: "",
        recipients: 0,
        reason: "",
        approvedBy: "",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        sentAt: null,
      });
      assert.equal(await repo.claim({ weekStart: WEEK, now: LATER }), null);
      assert.deepEqual(await repo.get(run.id), run);
      // Another week, and another attempt of the same week, are their own.
      assert.ok(await repo.claim({ weekStart: "2026-11-16", now: NOW }));
      assert.ok(await repo.claim({ weekStart: WEEK, attempt: 2, startedBy: "manual", now: NOW }));
      assert.equal(await repo.claim({ weekStart: WEEK, attempt: 2, startedBy: "manual", now: NOW }), null);
    },
    "of two claims at once, one gets the week": async (repo) => {
      const both = await Promise.all([repo.claim({ weekStart: WEEK, now: NOW }), repo.claim({ weekStart: WEEK, now: NOW })]);
      assert.equal(both.filter(Boolean).length, 1);
    },
    "moves a run only from the statuses given": async (repo) => {
      const run = await repo.claim({ weekStart: WEEK, now: NOW });
      const waiting = await repo.move(run.id, ["preparing"], "waiting", { subject: "This week", campaignId: "c1" }, LATER);
      assert.equal(waiting.status, "waiting");
      assert.equal(waiting.subject, "This week");
      assert.equal(waiting.campaignId, "c1");
      assert.equal(waiting.updatedAt, LATER.toISOString());
      assert.equal(waiting.createdAt, NOW.toISOString());
      // It isn't preparing any more, so this does nothing.
      assert.equal(await repo.move(run.id, ["preparing"], "failed", { reason: "x" }, LATER), null);
      assert.equal((await repo.get(run.id)).status, "waiting");
      assert.equal(await repo.move(987_654, ["waiting"], "sending", {}, LATER), null);
    },
    "of two sends started at once, one gets the run": async (repo) => {
      const run = await repo.claim({ weekStart: WEEK, now: NOW });
      await repo.move(run.id, ["preparing"], "waiting", {}, NOW);
      const both = await Promise.all([
        repo.move(run.id, ["waiting"], "sending", { approvedBy: "a@example.com" }, LATER),
        repo.move(run.id, ["waiting"], "sending", { approvedBy: "b@example.com" }, LATER),
      ]);
      assert.equal(both.filter(Boolean).length, 1);
    },
    "update sets fields and never the week, the attempt or the id": async (repo) => {
      const run = await repo.claim({ weekStart: WEEK, now: NOW });
      const updated = await repo.update(run.id, { recipients: 244, weekStart: "2030-01-07", attempt: 9, id: 77 }, LATER);
      assert.deepEqual(updated, { ...run, recipients: 244, updatedAt: LATER.toISOString() });
      assert.equal(await repo.update(987_654, { recipients: 1 }, LATER), null);
    },
    "latest is the week's newest attempt; history is newest first": async (repo) => {
      assert.equal(await repo.latest(WEEK), null);
      const first = await repo.claim({ weekStart: WEEK, now: NOW });
      const older = await repo.claim({ weekStart: "2026-11-02", now: NOW });
      const again = await repo.claim({ weekStart: WEEK, attempt: 2, startedBy: "manual", now: LATER });
      assert.deepEqual(await repo.latest(WEEK), again);
      assert.deepEqual(
        (await repo.history(10)).map((run) => run.id),
        [again.id, first.id, older.id],
      );
      assert.equal((await repo.history(1)).length, 1);
    },
    "keeps the test emails sent, oldest first, from a moment on": async (repo) => {
      await repo.logTest({ email: "Someone@Example.com", sentAt: "2026-11-10T09:00:00.000Z" });
      await repo.logTest({ email: "other@example.com", sentAt: "2026-11-10T10:00:00.000Z" });
      assert.deepEqual(await repo.testsSince("2026-11-10T00:00:00.000Z"), [
        { email: "someone@example.com", sentAt: "2026-11-10T09:00:00.000Z" },
        { email: "other@example.com", sentAt: "2026-11-10T10:00:00.000Z" },
      ]);
      assert.deepEqual(await repo.testsSince("2026-11-10T09:30:00.000Z"), [
        { email: "other@example.com", sentAt: "2026-11-10T10:00:00.000Z" },
      ]);
    },
  },
});

describe("WeeklyEmailRepository (d1) storage", () => {
  it("refuses a second row for the same week and attempt, whatever writes it", async () => {
    const db = createTestD1("ops");
    await d1WeeklyEmailRepository(db).claim({ weekStart: WEEK, now: NOW });
    await assert.rejects(() =>
      db
        .prepare("INSERT INTO weekly_emails (week_start, attempt, created_at, updated_at) VALUES (?, 1, 'x', 'x')")
        .bind(WEEK)
        .run(),
    );
  });
});

describe("weeklyEmailRepository", () => {
  it("is the ops database's, or the one a test hands in", async () => {
    const repo = memoryWeeklyEmailRepository();
    assert.equal(weeklyEmailRepository({ weeklyEmailRepository: repo }), repo);
    const OPS_DB = createTestD1("ops");
    const run = await weeklyEmailRepository({ SITE_ENV: "dev", OPS_DB }).claim({ weekStart: WEEK, now: NOW });
    assert.equal((await d1WeeklyEmailRepository(OPS_DB).get(run.id)).weekStart, WEEK);
  });
});
