/**
 * The email that promotes Pinsa A Roma (#348), ready in ops as a draft:
 * Email → Overview shows it under One-off, to check, send yourself a test
 * and then send. Nothing goes to the list from here.
 *
 * It goes the way ops does it: the pop-up kitchen's template
 * (ops/site/src/email/server/promote.js promoteDraft, what Promote… makes)
 * builds it from the pop-up as ops has it (its picture, when it cooks, three
 * dishes and the links to its menu and to book), and it is saved as a draft
 * (one-off-email-repository.js create), its links pointing at this
 * environment's website.
 *
 * Runs after 2026-11-19-pinsa-a-roma.mjs, which adds the pop-up (the dates
 * sort them). Only once: an email already promoting it (its subject names
 * it), drafted here or by hand, is left as it is. No Pinsa A Roma, or one
 * that's deleted, and it says so and does nothing.
 *
 * --dry-run (with --only) changes nothing: it runs on a copy of the data
 * (scripts/lib/d1-rehearsal.mjs) and says what the draft would be.
 */
import { listEvents } from "../ops/site/src/events/server/event-store.js";
import { emailsTable, d1OneOffEmailRepository } from "../ops/site/src/email/server/adapters/d1-one-off-email.js";
import { emailFrame } from "../ops/site/src/email/server/email-frame.js";
import { promoteDraft } from "../ops/site/src/email/server/promote.js";
import { databaseForMigration } from "../scripts/lib/d1-rehearsal.mjs";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Email: a draft promoting Pinsa A Roma, made from the pop-up kitchen's template";

/** /whats-on/pinsa-a-roma */
export const SLUG = "pinsa-a-roma";
/** Who the draft says made it. */
export const BY = "migration: Pinsa A Roma email";

export async function up({ env, d1, processEnv, log, dryRun = false, now = new Date() }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const emailDb = await databaseForMigration(d1("ops"), { env, role: "ops", tables: [emailsTable.table], dryRun, log });
  const emails = d1OneOffEmailRepository(emailDb);

  const popup = (await listEvents(data.env)).find((event) => event.slug === SLUG);
  if (!popup) {
    log(`Nothing to do: there's no pop-up kitchen at /whats-on/${SLUG}, so there's nothing to promote.`);
    return { drafted: false };
  }
  const there = (await emails.list(500)).find((email) => /pinsa a roma/i.test(email.subject));
  if (there) {
    log(`Nothing to do: "${there.subject}" (email ${there.id}, ${there.status}) already promotes it; left as it is.`);
    return { drafted: false };
  }

  const draft = await promoteDraft(data.env, { template: "popup", id: String(popup.id) }, { site: emailFrame(data.env).site });
  const saved = await emails.create({ ...draft, by: BY, now });
  log(`${dryRun ? "would draft" : "drafted"} "${saved.subject}" (email ${saved.id}): ${saved.sections.length} sections, links to ${emailFrame(data.env).site.origin}`);
  log("It's a draft: Email → Overview in ops, then Send me a test, then send it.");
  return { drafted: true, id: saved.id };
}
