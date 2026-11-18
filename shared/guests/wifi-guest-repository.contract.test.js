/**
 * What every WifiGuestRepository adapter must do: memory and D1 (SQLite with
 * the real migrations). The Wi-Fi portal is its consumer.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../testing/d1-sqlite.js";
import { repositoryContract } from "../testing/repository-contract.js";
import { d1WifiGuestRepository } from "./adapters/d1-wifi-guests.js";
import { memoryWifiGuestRepository } from "./adapters/memory-wifi-guests.js";
import { recordWifiGuest } from "./wifi-guests.js";

const ADAPTERS = {
  memory: () => memoryWifiGuestRepository(),
  d1: () => d1WifiGuestRepository(createTestD1("website")),
};

async function seed(repo) {
  await repo.recordVisit({ email: "ada@example.com", on: "2026-11-01" });
  await repo.recordVisit({ email: "grace@example.com", on: "2026-11-02" });
  await repo.recordVisit({ email: "ada@example.com", on: "2026-11-15" });
}

repositoryContract("WifiGuestRepository", {
  adapters: ADAPTERS,
  seed,
  cases: {
    "a first visit is one record, seen first and last that day": async (
      repo,
    ) => {
      const guest = await repo.recordVisit({
        email: "ada@example.com",
        on: "2026-11-01",
      });
      assert.equal(typeof guest.id, "number");
      assert.deepEqual(await repo.getByEmail("ADA@example.com"), {
        id: guest.id,
        email: "ada@example.com",
        firstSeenOn: "2026-11-01",
        lastSeenOn: "2026-11-01",
      });
      assert.equal(await repo.getByEmail("nobody@example.com"), null);
    },
    "coming back keeps the first day and moves the last one": async (repo) => {
      const first = await repo.recordVisit({
        email: "ada@example.com",
        on: "2026-11-01",
      });
      const again = await repo.recordVisit({
        email: "Ada@Example.com",
        on: "2026-11-15",
      });
      assert.deepEqual(again, {
        id: first.id,
        email: "ada@example.com",
        firstSeenOn: "2026-11-01",
        lastSeenOn: "2026-11-15",
      });
      assert.equal(await repo.count(), 1);
    },
    "removes and counts": async (repo) => {
      await seed(repo);
      assert.equal(await repo.count(), 2);
      const grace = await repo.getByEmail("grace@example.com");
      await repo.remove(grace.id);
      await repo.remove(grace.id);
      assert.equal(await repo.count(), 1);
      assert.equal(await repo.getByEmail("grace@example.com"), null);
    },
    "exports every record by id": async (repo) => {
      await seed(repo);
      const { wifiGuests } = await repo.exportAll();
      assert.deepEqual(
        wifiGuests.map(({ email, firstSeenOn, lastSeenOn }) => [
          email,
          firstSeenOn,
          lastSeenOn,
        ]),
        [
          ["ada@example.com", "2026-11-01", "2026-11-15"],
          ["grace@example.com", "2026-11-02", "2026-11-02"],
        ],
      );
    },
  },
});

describe("recordWifiGuest", () => {
  it("keeps the address in lower case, seen today (UTC)", async () => {
    const repo = memoryWifiGuestRepository();
    const result = await recordWifiGuest(repo, {
      email: " Ada@Example.com ",
      now: new Date("2026-11-18T23:30:00Z"),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(await repo.getByEmail("ada@example.com"), {
      id: result.guest.id,
      email: "ada@example.com",
      firstSeenOn: "2026-11-18",
      lastSeenOn: "2026-11-18",
    });
  });

  it("refuses a bad address before storage", async () => {
    const repo = memoryWifiGuestRepository();
    assert.deepEqual(await recordWifiGuest(repo, { email: "nope" }), {
      ok: false,
      error: "Valid email required.",
    });
    assert.equal(await repo.count(), 0);
  });
});
