/**
 * What every SubscriberRepository adapter must do (#186): memory, Baserow
 * (a fake Website database) and D1 (SQLite with the real migrations).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { createTestD1 } from "../testing/d1-sqlite.js";
import { repositoryContract } from "../testing/repository-contract.js";
import { d1SubscriberRepository } from "./adapters/d1-subscribers.js";
import { memorySubscriberRepository } from "./adapters/memory-subscribers.js";
import { subscribe } from "./subscribers.js";
import { SUBSCRIBER_ADAPTERS } from "./testing.js";

afterEach(() => vi.unstubAllGlobals());

const NOW = new Date("2026-10-06T12:00:00Z");

async function seed(repo) {
  await repo.create({
    email: "ada@example.com",
    tags: ["prelaunch"],
    signedUpOn: "2026-07-04",
    synced: true,
  });
  await repo.create({
    email: "grace@example.com",
    tags: ["prelaunch", "wifi"],
    signedUpOn: "2026-08-01",
    synced: false,
  });
  await repo.create({ email: "no-date@example.com", tags: [], synced: false });
}

repositoryContract("SubscriberRepository", {
  adapters: SUBSCRIBER_ADAPTERS,
  seed,
  cases: {
    "every field round-trips": async (repo) => {
      const created = await repo.create({
        email: "ada@example.com",
        tags: ["prelaunch", "wifi"],
        signedUpOn: "2026-07-04",
        synced: true,
      });
      assert.equal(typeof created.id, "number");
      assert.deepEqual(await repo.listByEmail("ada@example.com"), [
        {
          id: created.id,
          email: "ada@example.com",
          tags: ["prelaunch", "wifi"],
          signedUpOn: "2026-07-04",
          synced: true,
        },
      ]);
      assert.deepEqual(await repo.listByEmail("nobody@example.com"), []);
    },
    "a sign-up is one record; signing up again adds the tag and syncs again":
      async (repo) => {
        const first = await subscribe(repo, {
          email: " Ada@Example.com ",
          tag: "prelaunch",
          now: NOW,
        });
        assert.equal(first.ok, true);
        await repo.update(first.subscriber.id, { synced: true });

        const again = await subscribe(repo, {
          email: "ada@example.com",
          tag: "prelaunch",
        });
        assert.deepEqual([again.ok, again.changed], [true, false]);

        const wifi = await subscribe(repo, {
          email: "ada@example.com",
          tag: "wifi",
        });
        assert.deepEqual([wifi.ok, wifi.changed], [true, true]);
        assert.deepEqual(await repo.listByEmail("ada@example.com"), [
          {
            id: first.subscriber.id,
            email: "ada@example.com",
            tags: ["prelaunch", "wifi"],
            signedUpOn: "2026-10-06",
            synced: false,
          },
        ]);
      },
    "a bad address is refused before storage": async (repo) => {
      assert.deepEqual(await subscribe(repo, { email: "nope" }), {
        ok: false,
        status: 400,
        error: "Valid email required.",
      });
      assert.equal(await repo.count(), 0);
    },
    "update changes only the given fields; a missing record is null": async (
      repo,
    ) => {
      await seed(repo);
      const [ada] = await repo.listByEmail("ada@example.com");
      const updated = await repo.update(ada.id, { synced: false });
      assert.deepEqual(updated, { ...ada, synced: false });
      assert.equal(await repo.update(999999, { synced: true }), null);
    },
    "lists unsynced records by id, up to the limit, or all of them": async (
      repo,
    ) => {
      await seed(repo);
      const emails = (records) => records.map((record) => record.email);
      assert.deepEqual(emails(await repo.listUnsynced({ limit: 100 })), [
        "grace@example.com",
        "no-date@example.com",
      ]);
      assert.deepEqual(emails(await repo.listUnsynced({ limit: 1 })), [
        "grace@example.com",
      ]);
      assert.deepEqual(
        emails(await repo.listUnsynced({ limit: 100, all: true })),
        ["ada@example.com", "grace@example.com", "no-date@example.com"],
      );
    },
    "removes and counts": async (repo) => {
      await seed(repo);
      assert.equal(await repo.count(), 3);
      const [grace] = await repo.listByEmail("grace@example.com");
      await repo.remove(grace.id);
      await repo.remove(grace.id);
      assert.equal(await repo.count(), 2);
      assert.deepEqual(await repo.listByEmail("grace@example.com"), []);
    },
  },
});

describe("SubscriberRepository: one record per address", () => {
  for (const [name, make] of Object.entries({
    memory: () => memorySubscriberRepository(),
    d1: () => d1SubscriberRepository(createTestD1("website")),
  })) {
    it(`${name}: a second create of an address, in any case, is a duplicate`, async () => {
      const repo = make();
      await repo.create({ email: "ada@example.com", tags: ["prelaunch"] });
      await assert.rejects(
        repo.create({ email: "ADA@example.com", tags: ["wifi"] }),
        (error) => error.code === "duplicate",
      );
      assert.equal((await repo.listByEmail("Ada@Example.com")).length, 1);
    });
  }

  it("two sign-ups at once end in one record with both tags", async () => {
    const repo = d1SubscriberRepository(createTestD1("website"));
    // The race: both look, find nothing, and create.
    const racing = {
      ...repo,
      listByEmail: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockImplementation(repo.listByEmail),
    };
    await repo.create({ email: "ada@example.com", tags: ["prelaunch"] });
    const result = await subscribe(racing, {
      email: "ada@example.com",
      tag: "wifi",
    });
    assert.deepEqual([result.ok, result.changed], [true, true]);
    assert.deepEqual((await repo.listByEmail("ada@example.com"))[0].tags, [
      "prelaunch",
      "wifi",
    ]);
  });

  it("says why a sign-up failed, without the storage's words", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = (status) => ({
      listByEmail: async () => {
        throw Object.assign(new Error(`Baserow ${status}: nope`), { status });
      },
    });
    const result = (status) =>
      subscribe(failing(status), { email: "ada@example.com" });
    assert.equal((await result(429)).status, 429);
    assert.deepEqual(await result(503), {
      ok: false,
      status: 502,
      error: "Something went wrong. Try again?",
    });
  });
});
