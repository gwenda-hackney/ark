/**
 * OneOffEmailRepository on D1: the `emails` table of the ops database
 * (db/ops/migrations/0017_emails.sql, 0019_email_name.sql). The only email code that knows it.
 */
import { all, first, nowIso, run } from "../../../../../../shared/d1.js";
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { draftChange, oneOffEmail } from "../one-off-email-model.js";

export const emailsTable = d1Table({
  table: "emails",
  columns: {
    id: "int",
    name: "text",
    subject: "text",
    previewText: "text",
    sections: "json",
    status: "text",
    campaignId: "text",
    campaignWebId: "text",
    recipients: "int",
    reason: "text",
    createdBy: "text",
    updatedBy: "text",
    createdAt: "text",
    updatedAt: "text",
    scheduledFor: "date",
    sentAt: "date",
  },
  orderBy: "updated_at DESC, id DESC",
});

/** Fields a move may set, as the model keeps them; never the id, the content or when it was made. */
const MOVABLE = ["campaignId", "campaignWebId", "recipients", "reason", "scheduledFor", "sentAt", "updatedBy"];
export function moveFields(fields) {
  const full = oneOffEmail(fields);
  return Object.fromEntries(MOVABLE.filter((key) => fields[key] !== undefined).map((key) => [key, full[key]]));
}

const record = (row) => (row ? oneOffEmail(row) : null);
const limited = (limit) => Math.max(1, Math.min(200, Number(limit) || 50));

export function d1OneOffEmailRepository(db) {
  const get = async (id) => record(await emailsTable.get(db, id));
  /** One UPDATE, only while the email is in one of `from`: two callers can't both win. */
  async function setIf(id, from, fields) {
    const row = emailsTable.toRow(fields);
    const columns = Object.keys(row);
    const meta = await run(
      db,
      `UPDATE emails SET ${columns.map((column) => `${column} = ?`).join(", ")}
       WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`,
      [...columns.map((column) => row[column]), Number(id), ...from],
    );
    return meta.changes ? get(id) : null;
  }
  return {
    get,
    async create({ name = "", subject = "", previewText = "", sections = [], by = "", now = new Date() } = {}) {
      const at = nowIso(now);
      const fields = oneOffEmail({ name, subject, previewText, sections, createdBy: by, updatedBy: by, createdAt: at, updatedAt: at });
      delete fields.id;
      return record(await emailsTable.insert(db, fields));
    },
    async list(limit = 50) {
      const rows = await all(db, `SELECT * FROM emails ORDER BY updated_at DESC, id DESC LIMIT ?`, [limited(limit)]);
      return rows.map((row) => record(emailsTable.toRecord(row)));
    },
    async updateDraft(id, change = {}, { by = "", now = new Date() } = {}) {
      return setIf(id, ["draft"], { ...draftChange(change), updatedBy: oneOffEmail({ updatedBy: by }).updatedBy, updatedAt: nowIso(now) });
    },
    async removeDraft(id) {
      const meta = await run(db, `DELETE FROM emails WHERE id = ? AND status = 'draft'`, [Number(id)]);
      return Boolean(meta.changes);
    },
    async move(id, from, to, fields = {}, now = new Date()) {
      return setIf(id, from, { ...moveFields(fields), status: to, updatedAt: nowIso(now) });
    },
    async exportAll() {
      return exportTables(db, [emailsTable]);
    },
    async importAll(snapshot) {
      await importTables(db, [[emailsTable, (snapshot.emails || []).map(oneOffEmail)]]);
    },
  };
}
