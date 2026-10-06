/**
 * A series' gallery lives in ops (#183): the photos' Sanity asset ids as JSON,
 * newest first. Empty means the gallery is still in Drive, until the backfill
 * moves it. Before the ops deploy: new series write it.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Events: Gallery column";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Events", { name: "Gallery", type: "long_text" });
  log(`${ops.label}: Gallery ${result}`);
}
