/**
 * Guests as one feature for data-move (#127): subscribers and form
 * submissions, copied together: both live in the website database. Each
 * half imports only its own collection.
 */
import { d1FormSubmissionRepository } from "./adapters/d1-form-submissions.js";
import { d1SubscriberRepository } from "./adapters/d1-subscribers.js";

/** One repository's worth of copy methods over the two; importAll only when both can. */
export function guestsCopy({ subscribers, formSubmissions }) {
  const copy = {
    async exportAll() {
      return {
        ...(await subscribers.exportAll()),
        ...(await formSubmissions.exportAll()),
      };
    },
  };
  if (subscribers.importAll && formSubmissions.importAll)
    copy.importAll = async (snapshot) => {
      await subscribers.importAll({ subscribers: snapshot.subscribers ?? [] });
      await formSubmissions.importAll({
        formSubmissions: snapshot.formSubmissions ?? [],
      });
    };
  return copy;
}

export const d1Guests = (db) =>
  guestsCopy({
    subscribers: d1SubscriberRepository(db),
    formSubmissions: d1FormSubmissionRepository(db),
  });
