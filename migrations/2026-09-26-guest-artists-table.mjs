/**
 * Ops' own record of play applicants, one row per email: approved or
 * declined, and the artist name and link ops uses for events. What they
 * submitted stays untouched in the website's Form Submissions.
 */
import { GUEST_ARTIST_FIELDS } from "../ops/site/src/platform/baserow-schema.js";

export const app = "ops";
export const phase = "pre";
export const about = "Ops: Guest artists table";

export async function up({ database, log }) {
  const ops = await database("ops");
  log(`${ops.label}: Guest artists ${await ops.ensureTable("Guest artists", "Email")}`);
  for (const field of GUEST_ARTIST_FIELDS) {
    log(`${ops.label}: Guest artists / ${field.name} ${await ops.ensureField("Guest artists", field)}`);
  }
}
