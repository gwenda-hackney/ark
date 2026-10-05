/**
 * Event photos live in Sanity and ops keeps their asset ids (#183), so the
 * Baserow file columns they replaced go: Events "Main image" and "Images",
 * Event dates "Override image". After the ops deploy: the new code no longer
 * reads them.
 *
 * Removing a column can't be undone, so it refuses while any photo hasn't
 * moved yet (the backfill, 2026-10-05-event-images-backfill, must have run
 * in this environment first) and names what's left.
 */
export const app = "ops";
export const phase = "post";
export const about = "Events: remove the Baserow photo files (Main image, Images, Override image)";

const text = (value) => (value == null ? "" : String(value).trim());
const hasFile = (value) => Array.isArray(value) && value.some((file) => text(file?.name));

/** Rows whose photo or gallery hasn't moved into Sanity and ops yet. */
export function unmoved({ events, nights }) {
  const left = [];
  for (const row of events) {
    if (!text(row.Name)) continue;
    if (hasFile(row["Main image"]) && !text(row["Hero asset"])) left.push(`${row.Name}: main image`);
    if (row.Gallery !== undefined && !text(row.Gallery)) left.push(`${row.Name}: gallery`);
  }
  for (const row of nights) {
    if (hasFile(row["Override image"]) && !text(row["Override asset"])) left.push(`${row.Name}: flyer`);
  }
  return left;
}

export async function up({ database, log }) {
  const ops = await database("ops");
  const left = unmoved({ events: await ops.rows("Events"), nights: await ops.rows("Event dates") });
  if (left.length) {
    throw new Error(
      `Not removing the photo columns: ${left.length} photos haven't moved to Sanity yet. Run the backfill first.\n  ${left.join("\n  ")}`,
    );
  }
  for (const [table, field] of [
    ["Events", "Main image"],
    ["Events", "Images"],
    ["Event dates", "Override image"],
  ]) {
    log(`${ops.label}: ${table} ${field} ${await ops.removeField(table, field)}`);
  }
}
