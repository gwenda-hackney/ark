/**
 * Event photos go straight to Sanity (#183). Ops keeps each one's asset id:
 * Hero asset for the series main image, Override asset for a night's flyer.
 * Before the ops deploy: the new code writes them. The old file columns stay
 * until the backfill has moved every photo across.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Events: Hero asset; Event dates: Override asset";

export async function up({ database, log }) {
  const ops = await database("ops");
  const hero = await ops.ensureField("Events", { name: "Hero asset", type: "text" });
  log(`${ops.label}: Hero asset ${hero}`);
  const override = await ops.ensureField("Event dates", { name: "Override asset", type: "text" });
  log(`${ops.label}: Override asset ${override}`);
}
