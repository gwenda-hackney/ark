/**
 * A series' web address can change in ops. Old addresses are kept here, one
 * per line, so the website redirects them. Ops asks for the column only when
 * an address changes.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Events: Former slugs column";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Events", { name: "Former slugs", type: "long_text" });
  log(`${ops.label}: Former slugs ${result}`);
}
