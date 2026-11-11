/**
 * Move one feature's data between repositories (#127): Baserow → D1 for a
 * cutover, or D1 production → D1 dev for the dev copy. Repository to
 * repository, so the adapters stay the only code that knows storage (#186).
 *
 * A snapshot is what a repository's exportAll() returns: collections of
 * records, each with its id, e.g. { events: [...], nights: [...] }. The move
 * exports the source, drops what a feature never copies (smoke-test rows),
 * imports into the target, exports the target again and diffs the two. Any
 * difference fails the move.
 */

/** @typedef {Record<string, Array<{ id: string | number }>>} Snapshot */

/** Records each collection holds, e.g. { events: 12, nights: 140 }. */
export function countSnapshot(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([name, records]) => [name, records.length]),
  );
}

/** Keys sorted, so two records that differ only in key order are equal. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

/**
 * Every difference between two snapshots, by collection and id. Fields name
 * the record fields that differ; values aren't reported, since they may be
 * personal (subscriber emails).
 * @returns {Array<{ collection: string, id: string, kind: "missing" | "extra" | "changed", fields?: string[] }>}
 */
export function diffSnapshots(expected, actual) {
  const out = [];
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const collection of [...names].sort()) {
    const want = new Map(
      (expected[collection] || []).map((r) => [String(r.id), r]),
    );
    const got = new Map(
      (actual[collection] || []).map((r) => [String(r.id), r]),
    );
    for (const [id, record] of want) {
      const other = got.get(id);
      if (!other) {
        out.push({ collection, id, kind: "missing" });
        continue;
      }
      const fields = [
        ...new Set([...Object.keys(record), ...Object.keys(other)]),
      ]
        .filter(
          (key) =>
            JSON.stringify(canonical(record[key])) !==
            JSON.stringify(canonical(other[key])),
        )
        .sort();
      if (fields.length) out.push({ collection, id, kind: "changed", fields });
    }
    for (const id of got.keys())
      if (!want.has(id)) out.push({ collection, id, kind: "extra" });
  }
  return out;
}

/**
 * The snapshot without the records the feature never copies. `keep` also
 * gets the whole collection, for rules about one record among others
 * (config's duplicates).
 */
export function keptSnapshot(snapshot, keep = () => true) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([collection, records]) => [
      collection,
      records.filter((record) => keep(collection, record, records)),
    ]),
  );
}

/**
 * The snapshot without what `detach` says a record must leave behind:
 * `detach(collection, record)` returns the fields to replace, or nothing.
 * Also counts, per collection and field, the records it changed, e.g.
 * { events: { driveFolderId: 12 } }. Values aren't reported.
 */
export function detachedSnapshot(snapshot, detach) {
  const detached = {};
  const out = Object.fromEntries(
    Object.entries(snapshot).map(([collection, records]) => [
      collection,
      records.map((record) => {
        const fields = (detach && detach(collection, record)) || {};
        const changed = Object.keys(fields).filter(
          (key) => JSON.stringify(canonical(fields[key])) !== JSON.stringify(canonical(record[key])),
        );
        if (!changed.length) return record;
        detached[collection] ||= {};
        for (const key of changed) detached[collection][key] = (detached[collection][key] || 0) + 1;
        return { ...record, ...fields };
      }),
    ]),
  );
  return { snapshot: out, detached };
}

/** e.g. "driveFolderId of 12 events, clickupTaskId of 140 nights"; "" for nothing. */
export function describeDetached(detached = {}) {
  return Object.entries(detached)
    .flatMap(([collection, fields]) => Object.entries(fields).map(([field, n]) => `${field} of ${n} ${collection}`))
    .join(", ");
}

const LEFT_BEHIND = "left behind, as it points at production";

/**
 * Export, import, check. Throws when the target doesn't match afterwards.
 * `detach` (see detachedSnapshot) is applied before the import, so what it
 * leaves behind never reaches the target; the check is against what went in.
 * @param {{ source: { exportAll(): Promise<Snapshot> }, target: { importAll(s: Snapshot): Promise<unknown>, exportAll(): Promise<Snapshot> },
 *   keep?: (collection: string, record: object, records: object[]) => boolean,
 *   detach?: (collection: string, record: object) => object | null | undefined, log?: (line: string) => void }} move
 * @returns {Promise<{ counts: Record<string, number>, skipped: Record<string, number>, detached: Record<string, Record<string, number>> }>}
 */
export async function moveFeature({ source, target, keep, detach, log = () => {} }) {
  const exported = await source.exportAll();
  const { snapshot, detached } = detachedSnapshot(keptSnapshot(exported, keep), detach);
  const counts = countSnapshot(snapshot);
  const all = countSnapshot(exported);
  const skipped = Object.fromEntries(
    Object.entries(all)
      .map(([name, n]) => [name, n - counts[name]])
      .filter(([, n]) => n > 0),
  );
  log(
    `exported: ${describeCounts(counts)}${Object.keys(skipped).length ? ` (left out: ${describeCounts(skipped)})` : ""}`,
  );

  const left = describeDetached(detached);
  if (left) log(`${LEFT_BEHIND}: ${left}`);

  await target.importAll(snapshot);
  log("imported");

  const differences = diffSnapshots(snapshot, await target.exportAll());
  if (differences.length) {
    for (const d of differences.slice(0, 20))
      log(
        `  ${d.collection} ${d.id}: ${d.kind}${d.fields ? ` (${d.fields.join(", ")})` : ""}`,
      );
    throw new Error(
      `The copy doesn't match the source: ${differences.length} difference(s)${differences.length > 20 ? ", first 20 above" : " above"}.`,
    );
  }
  log(`checked: the target matches the source record for record${left ? ", but for what was left behind" : ""}`);
  return { counts, skipped, detached };
}

export function describeCounts(counts) {
  const parts = Object.entries(counts).map(([name, n]) => `${n} ${name}`);
  return parts.length ? parts.join(", ") : "nothing";
}

/** What a move did, for its last line. */
export function describeMove({ counts, detached }) {
  const left = describeDetached(detached);
  return `${describeCounts(counts)}${left ? `; ${LEFT_BEHIND}: ${left}` : ""}`;
}
