/**
 * OneOffEmailRepository (#348): the only way ops reads or writes the one-off
 * emails written in ops. It speaks in emails (one-off-email-model.js
 * oneOffEmail), never in tables or columns. Every adapter implements all of
 * it, and one-off-email-repository.contract.test.js holds them to the same
 * behaviour:
 *
 *   create({ subject, previewText, sections, by, now })
 *                         a new draft
 *   get(id)               the email, or null
 *   list(limit)           emails, most recently changed first
 *   updateDraft(id, change, { by, now })
 *                         the draft with `change` (draftChange) set, or null
 *                         when it's missing or no longer a draft. Atomic: a
 *                         draft that has started sending isn't changed.
 *   removeDraft(id)       true when a draft went; never anything else
 *   move(id, from, to, fields, now)
 *                         the email moved to status `to`, or null when it
 *                         wasn't in one of `from`. Atomic: of two callers,
 *                         one gets it. (Sending and scheduling, step 2.)
 *   exportAll()           { emails }
 *   importAll(snapshot)   replace everything, keeping ids
 *
 * D1 only (the ops database).
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1OneOffEmailRepository } from "./adapters/d1-one-off-email.js";

/** The repository for this runtime. Tests may hand one in as env.oneOffEmailRepository. */
export function oneOffEmailRepository(env) {
  return env?.oneOffEmailRepository || d1OneOffEmailRepository(databaseFor(env, "ops"));
}
