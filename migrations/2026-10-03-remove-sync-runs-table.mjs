/**
 * The Mailchimp sync no longer logs its runs (#137): nothing read the
 * "Subscribe sync runs" table, and it held a row for every hourly run since
 * launch. Production only (dev never had it); safe to re-run.
 */
export const app = "ops";
export const phase = "post";
export const about = 'Website: remove the "Subscribe sync runs" table';

export async function up({ env, database, log }) {
  if (env !== "production") return log("production only");
  const website = await database("website");
  log(`${website.label}: Subscribe sync runs ${await website.removeTable("Subscribe sync runs")}`);
}
