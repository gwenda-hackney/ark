/**
 * A night can link its own guest artist (Instagram or website) instead of
 * the series' link. Ops reads the column only when it exists.
 */
export const app = "ops";
export const phase = "pre";
export const about = "Event dates: Page link override column";

export async function up({ database, log }) {
  const ops = await database("ops");
  const result = await ops.ensureField("Event dates", { name: "Page link override", type: "url" });
  log(`${ops.label}: Page link override ${result}`);
}
