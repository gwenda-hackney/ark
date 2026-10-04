/**
 * A cocktail's ABV and Volume follow its recipe unless set by hand. Menu
 * Items gets two boolean columns saying which are set by hand. Before the
 * ops deploy: the new code writes them, and saves leave them out until they
 * are there.
 *
 * No rows are touched. A Baserow boolean is never empty, so every drink
 * starts with both off; ops then treats a stored figure that isn't the one
 * its recipe works out as set by hand (menu/metric-override.js), and the
 * editor's next Save writes the flag. Nothing printed changes.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Menu Items: ABV override and Volume override columns";

export async function up({ database, log }) {
  const ops = await database("ops");
  for (const name of ["ABV override", "Volume override"]) {
    const result = await ops.ensureField("Menu Items", { name, type: "boolean" });
    log(`${ops.label}: ${name} ${result}`);
  }
}
