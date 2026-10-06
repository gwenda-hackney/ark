/**
 * Artist photos go straight to Sanity (#183). Ops keeps each one's asset id:
 * Portrait asset for the portrait, and JSON lists in Art assets and Gwenda
 * assets. Before the ops deploy: the new code writes them. The old file
 * columns stay until the backfill has moved every photo across.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Artists: Portrait asset, Art assets, Gwenda assets";

export async function up({ database, log }) {
  const ops = await database("ops");
  for (const [name, type] of [
    ["Portrait asset", "text"],
    ["Art assets", "long_text"],
    ["Gwenda assets", "long_text"],
  ]) {
    const result = await ops.ensureField("Artists", { name, type });
    log(`${ops.label}: ${name} ${result}`);
  }
}
