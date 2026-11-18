/** OneOffEmailRepository in memory, for tests. Same behaviour as D1 (the contract test). */
import { nowIso } from "../../../../../../shared/d1.js";
import { draftChange, oneOffEmail } from "../one-off-email-model.js";
import { moveFields } from "./d1-one-off-email.js";

const clone = (email) => (email ? structuredClone(email) : null);

export function memoryOneOffEmailRepository() {
  let emails = [];
  let next = 1;
  const find = (id) => emails.find((email) => email.id === Number(id));
  const newestFirst = (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id;
  return {
    async get(id) {
      return clone(find(id));
    },
    async create({ subject = "", previewText = "", sections = [], by = "", now = new Date() } = {}) {
      const at = nowIso(now);
      const email = oneOffEmail({ id: next++, subject, previewText, sections, createdBy: by, updatedBy: by, createdAt: at, updatedAt: at });
      emails.push(email);
      return clone(email);
    },
    async list(limit = 50) {
      return [...emails].sort(newestFirst).slice(0, Math.max(1, Math.min(200, Number(limit) || 50))).map(clone);
    },
    async updateDraft(id, change = {}, { by = "", now = new Date() } = {}) {
      const email = find(id);
      if (email?.status !== "draft") return null;
      Object.assign(email, draftChange(change), { updatedBy: oneOffEmail({ updatedBy: by }).updatedBy, updatedAt: nowIso(now) });
      return clone(email);
    },
    async removeDraft(id) {
      const email = find(id);
      if (email?.status !== "draft") return false;
      emails = emails.filter((other) => other !== email);
      return true;
    },
    async move(id, from, to, fields = {}, now = new Date()) {
      const email = find(id);
      if (!email || !from.includes(email.status)) return null;
      Object.assign(email, moveFields(fields), { status: to, updatedAt: nowIso(now) });
      return clone(email);
    },
    async exportAll() {
      return { emails: [...emails].sort((a, b) => a.id - b.id).map(clone) };
    },
    async importAll(snapshot) {
      emails = (snapshot.emails || []).map(oneOffEmail);
      next = Math.max(0, ...emails.map((email) => email.id)) + 1;
    },
  };
}
