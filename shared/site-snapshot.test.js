import test from "node:test";
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

test("fingerprints ignore revisions, timestamps and key order", () => {
  assert.equal(
    documentFingerprint(night("2026-10-03")),
    documentFingerprint({ date: "2026-10-03", title: "Gwenda Nights", _type: "event", _id: "event-nights-2026-10-03", _rev: "r9" }),
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
    docs: [night("2026-10-03", { time: "20:00" }), night("2026-10-17")],
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
