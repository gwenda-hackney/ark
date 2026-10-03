/**
 * Deleting an event that is on the website keeps it there until Update
 * website (#23). Until then ops hides it and offers Restore; this column says
 * when it was deleted. Before the ops deploy: the new code writes it.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Events: Deleted at column";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Events", { name: "Deleted at", type: "text" });
  log(`${ops.label}: Deleted at ${result}`);
}
