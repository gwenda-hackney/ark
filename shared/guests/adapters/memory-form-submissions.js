/**
 * FormSubmissionRepository in memory: for tests, and the reference for what
 * every adapter must do (form-submission-repository.contract.test.js).
 */
import {
  EMPTY_FORM_SUBMISSION,
  formSubmissionFields,
  newestFirst,
} from "../form-submissions.js";

const copy = (value) => structuredClone(value);

export function memoryFormSubmissionRepository() {
  const records = new Map();
  let nextId = 1;
  const byId = () => [...records.values()].sort((a, b) => a.id - b.id);

  return {
    async get(id) {
      const record = records.get(Number(id));
      return record ? copy(record) : null;
    },
    async listForEmail(formSlug, email) {
      const want = String(email).trim().toLowerCase();
      return byId()
        .filter(
          (record) =>
            record.formSlug === String(formSlug) &&
            record.replyTo.toLowerCase() === want,
        )
        .sort(newestFirst)
        .map(copy);
    },
    async listCurrent() {
      return byId()
        .filter((record) => record.current)
        .sort(newestFirst)
        .map(copy);
    },
    async create(fields) {
      const record = {
        ...EMPTY_FORM_SUBMISSION,
        ...formSubmissionFields(fields),
        id: nextId++,
      };
      records.set(record.id, record);
      return copy(record);
    },
    async update(id, fields) {
      const record = records.get(Number(id));
      if (!record) return null;
      Object.assign(record, formSubmissionFields(fields));
      return copy(record);
    },
    async remove(id) {
      records.delete(Number(id));
    },
    async count() {
      return records.size;
    },
    async capabilities() {
      return { editLink: true };
    },
    async exportAll() {
      return { formSubmissions: byId().map(copy) };
    },
    async importAll({ formSubmissions = [] }) {
      records.clear();
      for (const record of formSubmissions) {
        const id = Number(record.id);
        records.set(id, {
          ...EMPTY_FORM_SUBMISSION,
          ...formSubmissionFields(record),
          id,
        });
        nextId = Math.max(nextId, id + 1);
      }
    },
  };
}
