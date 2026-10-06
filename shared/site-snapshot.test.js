import { test } from "vitest";
import assert from "node:assert/strict";
import {
  buildSnapshot,
  documentFingerprint,
  parseSnapshot,
  pendingSignature,
  pendingSince,
} from "./site-snapshot.js";

const night = (date, extra = {}) => ({
  _id: `event-nights-${date}`,
  _type: "event",
  _rev: "r1",
  _updatedAt: "2026-09-01",
  title: "Gwenda Nights",
  date,
  ...extra,
});

test("fingerprints ignore revisions, timestamps, draft markers and key order", () => {
  assert.equal(
    documentFingerprint(night("2026-10-03")),
    documentFingerprint({ date: "2026-10-03", title: "Gwenda Nights", _type: "event", _id: "event-nights-2026-10-03", _rev: "r9" }),
  );
  // A draft read through the preview matches its published copy when unchanged.
  assert.equal(
    documentFingerprint(night("2026-10-03")),
    documentFingerprint(night("2026-10-03", { _originalId: "drafts.event-nights-2026-10-03" })),
  );
  assert.notEqual(
    documentFingerprint(night("2026-10-03")),
    documentFingerprint(night("2026-10-03", { time: "20:00" })),
  );
});

test("pending lists added, changed and removed documents and artists", () => {
  const snapshot = parseSnapshot(
    JSON.stringify(
      buildSnapshot({
        docs: [night("2026-10-03"), night("2026-10-10")],
        artists: [{ id: 1, order: "1", Name: "Ana", Active: true }],
      }),
    ),
  );
  const pending = pendingSince(snapshot, {
    docs: [night("2026-10-03", { time: "20:00", _rev: "r2" }), night("2026-10-17")],
    artists: [
      { id: 1, order: "2", Name: "Ana", Active: true },
      { id: 2, Name: "Bo" },
    ],
  });
  assert.equal(pending.known, true);
  assert.deepEqual(
    pending.items.map((item) => `${item.kind}:${item.change}:${item.label}`).sort(),
    [
      "artist:added:Bo",
      "document:added:Gwenda Nights · 2026-10-17",
      "document:changed:Gwenda Nights · 2026-10-03",
      "document:removed:Gwenda Nights · 2026-10-10",
    ],
  );
});

test("no snapshot means unknown, not everything pending", () => {
  assert.deepEqual(pendingSince(null, { docs: [night("x")] }), { known: false, items: [] });
  assert.equal(parseSnapshot("not json"), null);
});

test("signature ignores order", () => {
  const a = { kind: "document", id: "a", change: "added" };
  const b = { kind: "artist", id: "1", change: "changed" };
  assert.equal(pendingSignature([a, b]), pendingSignature([b, a]));
  assert.notEqual(pendingSignature([a]), pendingSignature([a, b]));
});

test("a document whose revision the snapshot recorded isn't fingerprinted again", () => {
  const snapshot = parseSnapshot(JSON.stringify(buildSnapshot({ docs: [night("2026-10-03")] })));
  assert.equal(snapshot.documents["event-nights-2026-10-03"][3], "r1");
  // Same revision: taken as unchanged without hashing (budget 0 proves it).
  const same = pendingSince(snapshot, { docs: [night("2026-10-03")] }, { budget: 0 });
  assert.deepEqual([same.items, same.complete], [[], true]);
  // A new revision with the same content: hashed, and not a change.
  const saved = pendingSince(snapshot, { docs: [night("2026-10-03", { _rev: "r2" })] });
  assert.deepEqual(saved.items, []);
  assert.deepEqual(saved.fingerprints, {
    "event-nights-2026-10-03": ["r2", documentFingerprint(night("2026-10-03"))],
  });
});

test("fingerprints kept from an earlier run are reused, and the budget caps new work", () => {
  // A snapshot from before revisions were recorded: every document needs a fingerprint once.
  const old = buildSnapshot({ docs: [night("a"), night("b"), night("c")] });
  for (const entry of Object.values(old.documents)) entry.length = 3;
  const docs = [night("a"), night("b"), night("c", { time: "20:00", _rev: "r2" })];

  const first = pendingSince(old, { docs }, { budget: 2 });
  assert.equal(first.complete, false);
  assert.equal(first.unresolved, 1);
  assert.deepEqual(first.items, [], "a document not looked at yet isn't reported as changed or removed");

  const second = pendingSince(old, { docs }, { fingerprints: first.fingerprints, budget: 2 });
  assert.equal(second.complete, true);
  assert.deepEqual(
    second.items.map((item) => `${item.change}:${item.label}`),
    ["changed:Gwenda Nights · c"],
  );
  const third = pendingSince(old, { docs }, { fingerprints: second.fingerprints, budget: 0 });
  assert.deepEqual([third.complete, third.items.length], [true, 1], "nothing left to hash");
});
