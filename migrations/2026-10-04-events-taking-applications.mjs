/**
 * A series can say it is taking applications, and then the website's Play at
 * Gwenda form lists it (#41). Before the ops deploy: the new code writes it,
 * and copes while the column is missing.
 *
 * When it adds the column, it switches on the five series the old typed form
 * offered (in each environment, matched by name), so the form lists the same
 * nights from the start. Only then: a series switched off later stays off,
 * and new ones (Happy Hour) start off.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Events: Taking applications column, on for the five play-form series";

/** The series the play form listed before, as normalised names. */
export const STARTING_SERIES = [
  "negronichesssociety",
  "gwendalive",
  "gwendaselects",
  "fridaywithguests",
  "radiogwenda",
];

/** "Negroni Chess Society test" (the dev copy) and "Gwenda + Live" alike. */
export function seriesKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/test$/, "");
}

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Events", { name: "Taking applications", type: "boolean" });
  log(`${ops.label}: Taking applications ${result}`);
  if (result !== "created") return;
  const rows = await ops.rows("Events");
  const on = rows.filter(
    (row) =>
      STARTING_SERIES.includes(seriesKey(row.Name)) &&
      !String(row["Deleted at"] || "").trim() &&
      String(row["Repeat unit"]?.value ?? row["Repeat unit"] ?? "").toLowerCase() !== "once",
  );
  await ops.updateRows("Events", on.map((row) => ({ id: row.id, "Taking applications": true })));
  log(`${ops.label}: switched on for ${on.map((row) => row.Name).join(", ") || "no series"}`);
}
