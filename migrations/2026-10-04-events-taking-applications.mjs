/**
 * A series can say it is taking applications, and then the website's Play at
 * Gwenda form lists it (#41). Before the ops deploy: the new code writes it,
 * and copes while the column is missing.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Events: Taking applications column";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Events", { name: "Taking applications", type: "boolean" });
  log(`${ops.label}: Taking applications ${result}`);
}
