/**
 * A drink can have any number of prices (a wine by the glass and the
 * bottle). Menu Items gets a Prices column holding them as JSON; Price and
 * Alt price stay, filled from the first two. Before the ops deploy: the new
 * code writes it, and reads Price / Alt price until it is there.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Menu Items: Prices column";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Menu Items", { name: "Prices", type: "long_text" });
  log(`${ops.label}: Prices ${result}`);
}
