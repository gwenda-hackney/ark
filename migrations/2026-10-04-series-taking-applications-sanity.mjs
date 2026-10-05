/**
 * Taking applications (#41) reaches the website through the published Sanity
 * series, which ops writes only when a series is next published. The column
 * migration switched it on in Baserow, so this sets the same series in
 * Sanity: the published document, and any draft so publishing it keeps the
 * flag. Only adds: switching a series off in ops publishes it without the flag.
 *
 * Runs before the play form migration (2026-10-05), which waits for a
 * published series taking applications. Safe to rerun.
 */
export const app = "web";
export const phase = "post";
export const about = "Series: Taking applications from ops onto the Sanity series";

const text = (value) => String(value?.value ?? value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

/** The Events rows ops marks Taking applications: live series, not one-offs. */
export function seriesTakingApplications(rows) {
  return rows.filter(
    (row) =>
      row["Taking applications"] === true &&
      !text(row["Deleted at"]) &&
      lower(row["Repeat unit"]) !== "once",
  );
}

/** Sanity series ids to switch on: matched by web address, else by name. */
export function seriesIdsToSwitchOn(rows, documents) {
  const slugs = new Set(rows.map((row) => text(row.Slug)).filter(Boolean));
  const names = new Set(rows.map((row) => lower(row.Name)).filter(Boolean));
  return documents
    .filter((doc) => doc.takingApplications !== true)
    .filter((doc) => slugs.has(text(doc.slug)) || names.has(lower(doc.title)))
    .map((doc) => doc._id);
}

export async function up({ database, sanity, log }) {
  const ops = await database("ops");
  // Rows have no Taking applications until the ops migration adds the column.
  const rows = seriesTakingApplications(await ops.rows("Events"));
  if (!rows.length) return log(`${ops.label}: no series taking applications`);

  const content = sanity();
  const documents = await content.query(
    `*[_type == "eventSeries" && removed != true]{ _id, title, "slug": slug.current, takingApplications }`,
  );
  const ids = seriesIdsToSwitchOn(rows, documents || []);
  if (!ids.length) return log(`${content.project}: series already taking applications`);

  await content.mutate(ids.map((id) => ({ patch: { id, set: { takingApplications: true } } })));
  log(`${content.project}: taking applications on ${ids.join(", ")}`);
}
