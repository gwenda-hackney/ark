/**
 * FormSubmissionRepository (guests, #186): the only way the website's forms
 * and ops' Forms page read or write submissions. Records are
 * form-submissions.js's; form-submission-repository.contract.test.js holds
 * every adapter to this:
 *
 *   get(id)                      FormSubmissionRecord, or null when missing
 *   listForEmail(formSlug, email)  that form's records from that address (any
 *                                case), newest first
 *   listCurrent()                every current record, newest first
 *   create(fields)               FormSubmissionRecord
 *   update(id, fields)           FormSubmissionRecord, or null when missing; only
 *                                the given fields change
 *   remove(id)                   a missing record is fine
 *   count()                      how many there are
 *   capabilities()               { editLink }: whether storage keeps editLink yet
 *   exportAll()                  { formSubmissions }; importAll(snapshot) on memory and D1
 *
 * Submissions live in the website D1 database (#127), with subscribers.
 * Guest artists (ops' decisions on play applications) are a different
 * feature, joined to these by email in ops.
 */
import { databaseFor } from "../d1-env.js";
import { d1FormSubmissionRepository } from "./adapters/d1-form-submissions.js";

/** The repository for this runtime. Tests may hand one in as env.formSubmissionRepository. */
export function formSubmissionRepository(env) {
  return env?.formSubmissionRepository || d1FormSubmissionRepository(databaseFor(env, "website"));
}
