/**
 * The Pinsa A Roma email, with more go in it: the pop-up kitchen's template
 * (ops/site/src/email/server/promote.js) now says "Just landed", nudges
 * people to come hungry, and lists what to order first. The draft
 * 2026-11-20-pinsa-a-roma-email.mjs made is made again from it.
 *
 * Only while it's still that migration's draft, as it left it: once someone
 * has changed it in ops (or sent it), it's theirs and is left alone, and
 * this says so. No draft, or no Pinsa A Roma, and it does nothing.
 *
 * --dry-run (with --only) changes nothing: it runs on a copy of the data
 * (scripts/lib/d1-rehearsal.mjs) and says what it would do.
 */
import { listEvents } from "../ops/site/src/events/server/event-store.js";
import { emailsTable, d1OneOffEmailRepository } from "../ops/site/src/email/server/adapters/d1-one-off-email.js";
import { emailFrame } from "../ops/site/src/email/server/email-frame.js";
import { promoteDraft } from "../ops/site/src/email/server/promote.js";
import { databaseForMigration } from "../scripts/lib/d1-rehearsal.mjs";
import { opsDataForMigration } from "../scripts/lib/ops-migration.mjs";
import { BY as DRAFTED_BY, SLUG } from "./2026-11-20-pinsa-a-roma-email.mjs";

export const app = "ops";
export const phase = "post";
export const about = "Email: the Pinsa A Roma draft made again from the livelier pop-up template, while no one has changed it";

/** Who the draft says changed it last. */
export const BY = "migration: Pinsa A Roma email, livelier";

export async function up({ env, d1, processEnv, log, dryRun = false, now = new Date() }) {
  const data = await opsDataForMigration({ env, d1, dryRun, log, processEnv });
  const emailDb = await databaseForMigration(d1("ops"), { env, role: "ops", tables: [emailsTable.table], dryRun, log });
  const emails = d1OneOffEmailRepository(emailDb);

  const popup = (await listEvents(data.env)).find((event) => event.slug === SLUG);
  if (!popup) {
    log(`Nothing to do: there's no pop-up kitchen at /whats-on/${SLUG}.`);
    return { changed: false };
  }
  const draft = (await emails.list(500)).find((email) => /pinsa a roma/i.test(email.subject));
  if (!draft) {
    log("Nothing to do: there's no Pinsa A Roma email to make livelier.");
    return { changed: false };
  }
  const ours = draft.status === "draft" && draft.updatedBy === DRAFTED_BY.toLowerCase();
  if (!ours) {
    const whose = draft.status !== "draft" ? `it's ${draft.status}` : `${draft.updatedBy || "someone"} changed it last`;
    log(`Left alone: "${draft.subject}" (email ${draft.id}): ${whose}, so it's theirs now.`);
    return { changed: false };
  }

  const fresh = await promoteDraft(data.env, { template: "popup", id: String(popup.id) }, { site: emailFrame(data.env).site });
  const saved = await emails.updateDraft(draft.id, fresh, { by: BY, now });
  log(`${dryRun ? "would make" : "made"} email ${draft.id} livelier: "${saved?.subject || fresh.subject}"`);
  for (const section of fresh.sections.filter((part) => part.kind === "heading")) log(`    ${section.text}`);
  return { changed: true, id: draft.id };
}
