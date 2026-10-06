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
 * Export, import, check. Throws when the target doesn't match afterwards.
 * @param {{ source: { exportAll(): Promise<Snapshot> }, target: { importAll(s: Snapshot): Promise<unknown>, exportAll(): Promise<Snapshot> },
 *   keep?: (collection: string, record: object, records: object[]) => boolean, log?: (line: string) => void }} move
 * @returns {Promise<{ counts: Record<string, number>, skipped: Record<string, number> }>}
 */
export async function moveFeature({ source, target, keep, log = () => {} }) {
  const exported = await source.exportAll();
  const snapshot = keptSnapshot(exported, keep);
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
  log("checked: the target matches the source record for record");
  return { counts, skipped };
}

export function describeCounts(counts) {
  const parts = Object.entries(counts).map(([name, n]) => `${n} ${name}`);
  return parts.length ? parts.join(", ") : "nothing";
}
