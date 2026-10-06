/**
 * FormSubmissionRepository on D1 (website database, db/website/migrations).
 */
import { first } from "../../d1.js";
import { d1Table, exportTables, importTables } from "../../d1-table.js";
import {
  EMPTY_FORM_SUBMISSION,
  formSubmissionFields,
  newestFirst,
} from "../form-submissions.js";

export const formSubmissionsTable = d1Table({
  table: "form_submissions",
  columns: {
    id: "int",
    formSlug: "text",
    formTitle: "text",
    submittedAt: "text",
    replyTo: "text",
    status: "text",
    current: "bool",
    answers: "json",
    notifySentAt: "text",
    receiptSentAt: "text",
    editLink: "text",
  },
  orderBy: "submitted_at DESC, id DESC",
});

/** @param {object} db  a D1 binding, or anything shaped like one */
export function d1FormSubmissionRepository(db) {
  // SQL orders by the text; the sort makes it the same order as every adapter's.
  const list = async (where, params) =>
    (await formSubmissionsTable.list(db, { where, params })).sort(newestFirst);

  return {
    async get(id) {
      return formSubmissionsTable.get(db, id);
    },
    async listForEmail(formSlug, email) {
      return list("form_slug = ? AND reply_to = ?", [
        String(formSlug),
        String(email).trim(),
      ]);
    },
    async listCurrent() {
      return list("current = 1", []);
    },
    async create(fields) {
      return formSubmissionsTable.insert(db, {
        ...EMPTY_FORM_SUBMISSION,
        ...formSubmissionFields(fields),
      });
    },
    async update(id, fields) {
      return formSubmissionsTable.patch(db, id, formSubmissionFields(fields));
    },
    async remove(id) {
      await formSubmissionsTable.remove(db, id);
    },
    async count() {
      return Number(
        (await first(db, "SELECT COUNT(*) AS n FROM form_submissions"))?.n ?? 0,
      );
    },
    async capabilities() {
      return { editLink: true };
    },
    async exportAll() {
      const { form_submissions } = await exportTables(db, [
        formSubmissionsTable,
      ]);
      return { formSubmissions: form_submissions };
    },
    async importAll({ formSubmissions = [] }) {
      await importTables(db, [
        [
          formSubmissionsTable,
          formSubmissions.map((record) => ({
            ...EMPTY_FORM_SUBMISSION,
            ...formSubmissionFields(record),
            id: record.id,
          })),
        ],
      ]);
    },
  };
}
