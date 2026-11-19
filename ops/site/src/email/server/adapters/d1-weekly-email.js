/**
 * WeeklyEmailRepository on D1: the `weekly_emails` and `weekly_email_tests`
 * tables of the ops database (db/ops/migrations/0012_weekly_email.sql, 0020_monthly_email.sql). The
 * only email code that knows them.
 */
import { all, first, nowIso, run } from "../../../../../../shared/d1.js";
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { monthRun } from "../weekly-email-model.js";

export const weeklyEmailsTable = d1Table({
  table: "weekly_emails",
  columns: {
    id: "int",
    monthStart: { column: "period_start", type: "date" },
    attempt: "int",
    status: "text",
    startedBy: "text",
    subject: "text",
    preheader: "text",
    campaignId: "text",
    campaignWebId: "text",
    recipients: "int",
    reason: "text",
    approvedBy: "text",
    createdAt: "text",
    updatedAt: "text",
    sentAt: "text",
  },
  orderBy: "period_start DESC, attempt DESC",
});

export const weeklyEmailTestsTable = d1Table({
  table: "weekly_email_tests",
  columns: { id: "int", email: "text", sentAt: "text" },
  orderBy: "sent_at, id",
});

/** Only the fields given, cleaned as the model keeps them; never the id, month or attempt. */
function cleanFields(fields) {
  const full = monthRun(fields);
  const fixed = new Set(["id", "monthStart", "attempt", "createdAt", "updatedAt"]);
  return Object.fromEntries(
    Object.keys(full)
      .filter((key) => !fixed.has(key) && fields[key] !== undefined)
      .map((key) => [key, full[key]]),
  );
}

const record = (row) => (row ? monthRun(row) : null);

export function d1WeeklyEmailRepository(db) {
  const get = async (id) => record(await weeklyEmailsTable.get(db, id));
  return {
    get,
    async claim({ monthStart, attempt = 1, startedBy = "schedule", now = new Date() }) {
      const at = nowIso(now);
      const row = weeklyEmailsTable.toRow(
        monthRun({ monthStart, attempt, startedBy, status: "preparing", createdAt: at, updatedAt: at }),
      );
      delete row.id;
      const columns = Object.keys(row);
      // The unique (period_start, attempt) index decides who has the month.
      const claimed = await first(
        db,
        `INSERT INTO weekly_emails (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
         ON CONFLICT (period_start, attempt) DO NOTHING RETURNING id`,
        columns.map((column) => row[column]),
      );
      return claimed ? get(claimed.id) : null;
    },
    async latest(monthStart) {
      const [row] = await weeklyEmailsTable.list(db, { where: "period_start = ?", params: [monthStart] });
      return record(row);
    },
    async history(limit = 10) {
      const rows = await all(
        db,
        `SELECT * FROM weekly_emails ORDER BY period_start DESC, attempt DESC LIMIT ?`,
        [Math.max(1, Math.min(100, Number(limit) || 10))],
      );
      return rows.map((row) => record(weeklyEmailsTable.toRecord(row)));
    },
    async move(id, from, to, fields = {}, now = new Date()) {
      const row = weeklyEmailsTable.toRow({ ...cleanFields(fields), status: to, updatedAt: nowIso(now) });
      const columns = Object.keys(row);
      // One statement: only a run still in `from` moves, so two callers can't both win.
      const meta = await run(
        db,
        `UPDATE weekly_emails SET ${columns.map((column) => `${column} = ?`).join(", ")}
         WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`,
        [...columns.map((column) => row[column]), Number(id), ...from],
      );
      return meta.changes ? get(id) : null;
    },
    async update(id, fields = {}, now = new Date()) {
      return record(await weeklyEmailsTable.patch(db, id, { ...cleanFields(fields), updatedAt: nowIso(now) }));
    },
    async logTest({ email, sentAt }) {
      await weeklyEmailTestsTable.insert(db, { email: String(email).trim().toLowerCase(), sentAt });
    },
    async testsSince(iso) {
      const rows = await weeklyEmailTestsTable.list(db, { where: "sent_at >= ?", params: [iso] });
      return rows.map(({ email, sentAt }) => ({ email, sentAt }));
    },
    async exportAll() {
      return exportTables(db, [weeklyEmailsTable, weeklyEmailTestsTable]);
    },
    async importAll(snapshot) {
      await importTables(db, [
        [weeklyEmailsTable, (snapshot.weekly_emails || []).map(monthRun)],
        [weeklyEmailTestsTable, snapshot.weekly_email_tests || []],
      ]);
    },
  };
}
