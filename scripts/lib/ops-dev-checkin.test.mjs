import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { opsDevMode, startCheckIns } from "./ops-dev-checkin.mjs";

const T0 = Date.parse("2026-11-12T10:20:00Z");
const MINUTE = 60_000;
const PLAIN = ["node", "scripts/ops-dev.mjs"];
const LIVE = ["node", "scripts/ops-dev.mjs", "--live"];

describe("opsDevMode: what the flags make ops-dev do", () => {
  it("npm run ops:dev is a developer's machine on dev's data, and checks in", () => {
    assert.deepEqual(opsDevMode(PLAIN), { live: false, siteEnv: "local", checksIn: true });
  });

  it("npm run ops:prod (--live) runs as production and never checks in", () => {
    assert.deepEqual(opsDevMode(LIVE), { live: true, siteEnv: "production", checksIn: false });
  });
});

describe("startCheckIns: telling dev ops that local ops is running (#300)", () => {
  let checkIns;
  let clears;
  let warnings;

  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    checkIns = [];
    clears = [];
    warnings = [];
  });

  afterEach(() => vi.useRealTimers());

  const start = (argv, overrides = {}) =>
    startCheckIns({
      mode: opsDevMode(argv),
      env: { SITE_ENV: "", SOME_TOKEN: "t" },
      by: "dev@example.com",
      session: "laptop",
      checkIn: async (env, fields) => checkIns.push({ env, ...fields }),
      clear: async (env, session) => clears.push({ env, session }),
      warn: (message) => warnings.push(message),
      ...overrides,
    });

  it("ops:dev --live never checks in, nor clears anything when it stops", async () => {
    const session = start(LIVE);
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    await session.stop();
    assert.deepEqual(checkIns, []);
    assert.deepEqual(clears, []);
  });

  it("plain ops:dev checks in at once and every minute, as this machine, since it started", async () => {
    start(PLAIN);
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(checkIns.length, 1);
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    assert.equal(checkIns.length, 3);
    for (const [i, call] of checkIns.entries()) {
      assert.equal(call.env.SITE_ENV, "local", "a developer's machine: dev's config");
      assert.equal(call.env.SOME_TOKEN, "t");
      assert.equal(call.session, "laptop");
      assert.equal(call.by, "dev@example.com");
      assert.equal(call.since, T0);
      assert.equal(call.now, T0 + i * MINUTE);
    }
  });

  it("stopping clears its own check-in, once, and checks in no more", async () => {
    const session = start(PLAIN);
    await vi.advanceTimersByTimeAsync(MINUTE);
    await session.stop();
    await session.stop();
    const before = checkIns.length;
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    assert.equal(checkIns.length, before);
    assert.deepEqual(clears.map(({ env, session }) => [env.SITE_ENV, session]), [["local", "laptop"]]);
  });

  it("a check-in that fails warns once and keeps trying; local ops carries on", async () => {
    let fail = true;
    start(PLAIN, {
      checkIn: async (env, fields) => {
        if (fail) throw new Error("config unreachable");
        checkIns.push(fields);
      },
    });
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /config unreachable/);
    fail = false;
    await vi.advanceTimersByTimeAsync(MINUTE);
    assert.equal(checkIns.length, 1);
  });

  it("a clear that hangs doesn't keep ops-dev from exiting", async () => {
    const session = start(PLAIN, { clear: () => new Promise(() => {}) });
    const stopped = session.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    await stopped;
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /resume within 3 minutes/);
  });
});
