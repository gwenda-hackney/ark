/**
 * Drink photos go straight to Sanity, like event photos (#183). Ops keeps
 * each one's asset id in Menu Items "Photo asset". Before the ops deploy:
 * the new code writes it. The old Photo file column stays until the backfill
 * has moved every photo across.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Menu Items: Photo asset";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Menu Items", { name: "Photo asset", type: "text" });
  log(`${ops.label}: Photo asset ${result}`);
}
