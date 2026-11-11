/**
 * WeeklyEmailRepository (#186, #240): the only way ops reads or writes what
 * happened to each week's email, and the test emails staff sent. It speaks
 * in runs (weekly-email-model.js weekRun), never in tables or columns. Every
 * adapter implements all of it, and weekly-email-repository.contract.test.js
 * holds them to the same behaviour:
 *
 *   claim({ weekStart, attempt, startedBy, now })
 *                         the new run, or null when that week's attempt is
 *                         already taken. Atomic: of two callers, one gets it.
 *   get(id)               the run, or null
 *   latest(weekStart)     the week's newest attempt, or null
 *   history(limit)        runs, newest week (then attempt) first
 *   move(id, from, to, fields, now)
 *                         the run moved to status `to`, or null when it
 *                         wasn't in one of `from`. Atomic: of two callers
 *                         moving the same run, one gets it.
 *   update(id, fields, now)  the run with those fields set, or null when missing
 *   logTest({ email, sentAt })
 *   testsSince(iso)       [{ email, sentAt }], oldest first
 *   exportAll()           { weekly_emails, weekly_email_tests }
 *   importAll(snapshot)   replace everything, keeping ids
 *
 * D1 only (the ops database): this feature began after the move off Baserow.
 */
import { databaseFor } from "../../../../../shared/d1-env.js";
import { d1WeeklyEmailRepository } from "./adapters/d1-weekly-email.js";

/** The repository for this runtime. Tests may hand one in as env.weeklyEmailRepository. */
export function weeklyEmailRepository(env) {
  return env?.weeklyEmailRepository || d1WeeklyEmailRepository(databaseFor(env, "ops"));
}
