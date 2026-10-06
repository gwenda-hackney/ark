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
 * Baserow until `store:guests` says d1 (shared/data-store.js), together with
 * subscribers. Guest artists (ops' decisions on play applications) are a
 * different feature, joined to these by email in ops.
 */
import { switchedRepository } from "../data-store.js";
import { databaseFor } from "../d1-env.js";
import { baserowFormSubmissionRepository } from "./adapters/baserow-form-submissions.js";
import { d1FormSubmissionRepository } from "./adapters/d1-form-submissions.js";

/**
 * The repository for this runtime. Tests may hand one in as
 * env.formSubmissionRepository. `baserow` builds the Baserow adapter, for an
 * app whose Website token isn't BASEROW_API_KEY (ops).
 */
export function formSubmissionRepository(
  env,
  { baserow = baserowFormSubmissionRepository } = {},
) {
  if (env?.formSubmissionRepository) return env.formSubmissionRepository;
  return switchedRepository(env, "guests", {
    baserow,
    d1: (env) => d1FormSubmissionRepository(databaseFor(env, "website")),
  });
}
