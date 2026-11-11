/** WeeklyEmailRepository in memory, for tests. Same behaviour as D1 (the contract test). */
import { nowIso } from "../../../../../../shared/d1.js";
import { weekRun } from "../weekly-email-model.js";

const FIXED = new Set(["id", "weekStart", "attempt", "createdAt", "updatedAt"]);

function cleanFields(fields) {
  const full = weekRun(fields);
  return Object.fromEntries(
    Object.keys(full)
      .filter((key) => !FIXED.has(key) && fields[key] !== undefined)
      .map((key) => [key, full[key]]),
  );
}

export function memoryWeeklyEmailRepository() {
  let runs = [];
  let tests = [];
  let nextRun = 1;
  let nextTest = 1;
  const copy = (run) => (run ? { ...run } : null);
  const find = (id) => runs.find((run) => run.id === Number(id));
  const newestFirst = (a, b) => b.weekStart.localeCompare(a.weekStart) || b.attempt - a.attempt;
  return {
    async get(id) {
      return copy(find(id));
    },
    async claim({ weekStart, attempt = 1, startedBy = "schedule", now = new Date() }) {
      if (runs.some((run) => run.weekStart === weekStart && run.attempt === Number(attempt))) return null;
      const at = nowIso(now);
      const run = weekRun({ id: nextRun++, weekStart, attempt, startedBy, status: "preparing", createdAt: at, updatedAt: at });
      runs.push(run);
      return copy(run);
    },
    async latest(weekStart) {
      return copy(runs.filter((run) => run.weekStart === weekStart).sort(newestFirst)[0]);
    },
    async history(limit = 10) {
      return [...runs].sort(newestFirst).slice(0, Math.max(1, Math.min(100, Number(limit) || 10))).map(copy);
    },
    async move(id, from, to, fields = {}, now = new Date()) {
      const run = find(id);
      if (!run || !from.includes(run.status)) return null;
      Object.assign(run, cleanFields(fields), { status: to, updatedAt: nowIso(now) });
      return copy(run);
    },
    async update(id, fields = {}, now = new Date()) {
      const run = find(id);
      if (!run) return null;
      Object.assign(run, cleanFields(fields), { updatedAt: nowIso(now) });
      return copy(run);
    },
    async logTest({ email, sentAt }) {
      tests.push({ id: nextTest++, email: String(email).trim().toLowerCase(), sentAt });
    },
    async testsSince(iso) {
      return tests
        .filter((test) => test.sentAt >= iso)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id - b.id)
        .map(({ email, sentAt }) => ({ email, sentAt }));
    },
    async exportAll() {
      return {
        weekly_emails: [...runs].sort((a, b) => a.id - b.id).map(copy),
        weekly_email_tests: [...tests].sort((a, b) => a.id - b.id).map((test) => ({ ...test })),
      };
    },
    async importAll(snapshot) {
      runs = (snapshot.weekly_emails || []).map(weekRun);
      tests = (snapshot.weekly_email_tests || []).map((test) => ({ ...test }));
      nextRun = Math.max(0, ...runs.map((run) => run.id)) + 1;
      nextTest = Math.max(0, ...tests.map((test) => test.id)) + 1;
    },
  };
}
