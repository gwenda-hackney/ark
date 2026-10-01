import { test } from "vitest";
import assert from "node:assert/strict";
import { QUIET_MS, autoUpdateTick, decide, parseState } from "./site-pending.js";

const T0 = Date.parse("2026-09-25T10:00:00Z");
const item = (id, change = "changed") => ({ kind: "document", id, change, label: id });
const pending = (...items) => ({ known: true, items });

test("a new change starts the quiet timer; no build until it passes", () => {
  const first = decide(parseState(""), pending(item("a")), { now: T0 });
  assert.equal(first.action, "wait-quiet");
  assert.equal(first.state.changedAt, new Date(T0).toISOString());
  const later = decide(first.state, pending(item("a")), { now: T0 + QUIET_MS - 1 });
  assert.equal(later.action, "wait-quiet");
  assert.equal(decide(first.state, pending(item("a")), { now: T0 + QUIET_MS }).action, "build");
});

test("another change resets the timer", () => {
  const first = decide(parseState(""), pending(item("a")), { now: T0 });
  const second = decide(first.state, pending(item("a"), item("b")), { now: T0 + QUIET_MS });
  assert.equal(second.action, "wait-quiet");
  assert.equal(second.state.changedAt, new Date(T0 + QUIET_MS).toISOString());
});

test("waits for a running build; nothing pending is idle", () => {
  const state = { ...parseState(""), runId: 5, signature: "x" };
  assert.equal(decide(state, pending(item("a")), { now: T0, run: { completed: false } }).action, "wait-build");
  const done = decide(state, pending(), { now: T0, run: { completed: true, conclusion: "success" } });
  assert.equal(done.action, "idle");
  assert.equal(done.state.runId, null);
});

test("one automatic retry after a failure, then it needs help", () => {
  let { state } = decide(parseState(""), pending(item("a")), { now: T0 });
  state = { ...state, runId: 1 };
  let step = decide(state, pending(item("a")), { now: T0 + QUIET_MS, run: { completed: true, conclusion: "failure" } });
  assert.equal(step.action, "wait-quiet");
  assert.equal(step.state.failures, 1);
  step = decide(step.state, pending(item("a")), { now: T0 + 2 * QUIET_MS });
  assert.equal(step.action, "build");
  step = decide({ ...step.state, runId: 2 }, pending(item("a")), {
    now: T0 + 3 * QUIET_MS,
    run: { completed: true, conclusion: "failure" },
  });
  assert.equal(step.action, "needs-help");
});

test("no snapshot yet: nothing is pending and nothing builds", () => {
  assert.equal(decide(parseState(""), { known: false, items: [] }, { now: T0 }).action, "idle");
});

test("the tick builds each quiet site once and saves state", async () => {
  const store = new Map([
    ["ops:site.auto_update:production", JSON.stringify({ signature: "", changedAt: null })],
  ]);
  const dispatched = [];
  const deps = {
    now: T0 + QUIET_MS,
    read: async (_env, service, key, site) => store.get(`${service}:${key}:${site}`) || "",
    write: async (_env, service, key, site, value) => store.set(`${service}:${key}:${site}`, value),
    query: async () => [],
    artists: async () => [],
    status: async () => ({ completed: false }),
    dispatch: (site) => async () => {
      dispatched.push(site);
      return { runId: 9, runUrl: "u" };
    },
  };
  // First tick: a change appears (snapshot differs), timer starts.
  store.set("web:site.build_snapshot:production", JSON.stringify({ version: 1, documents: { gone: ["h", "Old", "event"] }, artists: {} }));
  let result = await autoUpdateTick({ SITE_ENV: "production" }, { ...deps, now: T0 });
  assert.equal(result.production.action, "wait-quiet");
  result = await autoUpdateTick({ SITE_ENV: "production" }, deps);
  assert.equal(result.production.action, "build");
  assert.deepEqual(dispatched, ["production"]);
  assert.equal(JSON.parse(store.get("ops:site.auto_update:production")).runId, 9);
  assert.equal(result.preview.action, "idle");
});
