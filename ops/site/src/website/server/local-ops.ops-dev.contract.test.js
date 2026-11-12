/**
 * Contract (#300): what `npm run ops:dev` (scripts/lib/ops-dev-checkin.mjs)
 * writes through checkIn / clearCheckIn is what hosted dev's automatic update
 * reads with localOpsPause. Both sides go through the config repository, so
 * this runs them against one in-memory repository, as the same config
 * database would be for both.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { memoryConfigRepository } from "../../../../../shared/config-adapters/memory-config.js";
import { LOCAL_OPS_KEY, checkIn, clearCheckIn, localOpsPause } from "./local-ops.js";

const T0 = Date.parse("2026-11-12T10:20:00Z");
const iso = (ms) => new Date(ms).toISOString();

function both() {
  const repo = memoryConfigRepository();
  return {
    repo,
    machine: { SITE_ENV: "local", configRepository: repo },
    hostedDev: { SITE_ENV: "dev", configRepository: repo },
  };
}

test("what local ops checks in, hosted dev reads as a pause, until local ops clears it", async () => {
  const { machine, hostedDev } = both();
  await checkIn(machine, { session: "laptop", since: T0, by: "dev@example.com", now: T0 + 60_000 });
  assert.deepEqual(await localOpsPause(hostedDev, { now: T0 + 2 * 60_000 }), {
    reason: "local-ops",
    since: iso(T0),
    by: "dev@example.com",
  });
  await clearCheckIn(machine, "laptop");
  assert.equal(await localOpsPause(hostedDev, { now: T0 + 2 * 60_000 }), null);
});

test("the check-in is dev's machine-state row, Service ops: the environment local ops belongs to", async () => {
  const { repo, machine } = both();
  await checkIn(machine, { session: "laptop", since: T0, by: "dev@example.com", now: T0 });
  const records = await repo.list();
  assert.deepEqual(
    records.map(({ name, env, service }) => ({ name, env, service })),
    [{ name: LOCAL_OPS_KEY, env: "dev", service: "ops" }],
  );
});

test("one session stopping doesn't clear another's check-in", async () => {
  const { machine, hostedDev } = both();
  await checkIn(machine, { session: "laptop", since: T0, by: "a@example.com", now: T0 });
  await checkIn(machine, { session: "desktop", since: T0 + 30_000, by: "b@example.com", now: T0 + 30_000 });
  await clearCheckIn(machine, "laptop");
  assert.equal((await localOpsPause(hostedDev, { now: T0 + 60_000 }))?.by, "b@example.com");
});
