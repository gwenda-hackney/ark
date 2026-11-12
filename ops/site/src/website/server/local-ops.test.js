/**
 * Local ops pauses hosted dev's automatic website updates (#300): the rules
 * for reading a check-in. The round trip with ops-dev is in
 * local-ops.ops-dev.contract.test.js.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { LOCAL_OPS_FRESH_MS, LOCAL_OPS_KEY, checkIn, localOpsPause } from "./local-ops.js";

const T0 = Date.parse("2026-11-12T10:20:00Z");
const iso = (ms) => new Date(ms).toISOString();
const checkInText = (fields = {}) =>
  JSON.stringify({ since: iso(T0), at: iso(T0), by: "dev@example.com", session: "laptop", ...fields });

/** A config state store holding `value` for the check-in, recording what was read. */
function store(value) {
  const reads = [];
  return {
    reads,
    read: async (_env, service, key, scope) => {
      reads.push(`${service}:${key}:${scope}`);
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

test("hosted dev: a check-in from the last few minutes pauses, saying since when and who", async () => {
  const { read, reads } = store(checkInText({ at: iso(T0 + 4 * 60_000) }));
  const pause = await localOpsPause({ SITE_ENV: "dev" }, { read, now: T0 + 6 * 60_000 });
  assert.deepEqual(pause, { reason: "local-ops", since: iso(T0), by: "dev@example.com" });
  assert.deepEqual(reads, [`ops:${LOCAL_OPS_KEY}:dev`], "dev's own row, Service ops");
});

test("a stale check-in doesn't pause: local ops stopped or crashed over 3 minutes ago", async () => {
  const { read } = store(checkInText());
  assert.ok(await localOpsPause({ SITE_ENV: "dev" }, { read, now: T0 + LOCAL_OPS_FRESH_MS }), "3 minutes: still paused");
  assert.equal(await localOpsPause({ SITE_ENV: "dev" }, { read, now: T0 + LOCAL_OPS_FRESH_MS + 1 }), null);
});

test("a check-in far in the future (a wrong clock) can't pause dev for long", async () => {
  const { read } = store(checkInText({ at: iso(T0 + LOCAL_OPS_FRESH_MS + 1) }));
  assert.equal(await localOpsPause({ SITE_ENV: "dev" }, { read, now: T0 }), null);
});

test("no check-in, a cleared one, a broken one or an unreadable one doesn't pause", async () => {
  for (const value of ["", "{not json", JSON.stringify({ by: "x" }), new Error("config down")]) {
    const { read } = store(value);
    assert.equal(await localOpsPause({ SITE_ENV: "dev" }, { read, now: T0 }), null, String(value));
  }
});

test("production never pauses: it doesn't even look", async () => {
  const { read, reads } = store(checkInText());
  assert.equal(await localOpsPause({ SITE_ENV: "production" }, { read, now: T0 }), null);
  assert.deepEqual(reads, []);
});

test("local ops itself isn't paused by its own check-in", async () => {
  const { read, reads } = store(checkInText());
  assert.equal(await localOpsPause({ SITE_ENV: "local" }, { read, now: T0 }), null);
  assert.deepEqual(reads, []);
});

test("without SITE_ENV nothing pauses (and nothing throws)", async () => {
  const { read } = store(checkInText());
  assert.equal(await localOpsPause({}, { read, now: T0 }), null);
});

test("only ops on a developer's machine checks in: never production, never hosted dev", async () => {
  const writes = [];
  const write = async (...args) => writes.push(args);
  for (const SITE_ENV of ["production", "dev", ""]) {
    await assert.rejects(
      checkIn({ SITE_ENV }, { session: "s", since: T0, by: "dev@example.com", now: T0 }, { write }),
      /developer's machine/,
      SITE_ENV,
    );
  }
  assert.deepEqual(writes, []);
});
