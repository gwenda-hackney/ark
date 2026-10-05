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
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../shared/sanity-projects.js";

export const app = "web";
export const phase = "post";
export const about = "Series: Taking applications from ops onto the Sanity series";

const API = "v2025-01-01";

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

export async function up({ env, database, processEnv, log }) {
  const token = String(processEnv.SANITY_API_TOKEN || "").trim();
  if (!token) throw new Error("SANITY_API_TOKEN is not set.");
  const ops = await database("ops");
  // Rows have no Taking applications until the ops migration adds the column.
  const rows = seriesTakingApplications(await ops.rows("Events"));
  if (!rows.length) return log(`${ops.label}: no series taking applications`);

  const project = env === "production" ? REAL_SANITY_PROJECT_ID : DEV_SANITY_PROJECT_ID;
  const base = `https://${project}.api.sanity.io/${API}/data`;
  const call = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Sanity ${res.status}: ${await res.text()}`);
    return res.json();
  };

  const query = `*[_type == "eventSeries" && removed != true]{ _id, title, "slug": slug.current, takingApplications }`;
  const params = new URLSearchParams({ query, perspective: "raw" });
  const { result } = await call(`/query/production?${params}`);
  const ids = seriesIdsToSwitchOn(rows, result || []);
  if (!ids.length) return log(`${project}: series already taking applications`);

  await call("/mutate/production", {
    method: "POST",
    body: JSON.stringify({
      mutations: ids.map((id) => ({ patch: { id, set: { takingApplications: true } } })),
    }),
  });
  log(`${project}: taking applications on ${ids.join(", ")}`);
}
