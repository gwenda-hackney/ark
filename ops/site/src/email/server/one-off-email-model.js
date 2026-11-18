/**
 * A one-off email to the list (#348), as ops keeps it: a subject, a preview
 * line, its sections (shared/email/sections.js), and where it stands. The
 * rules about it live here; storage is behind one-off-email-repository.js.
 *
 *   draft       being written: it can be changed, tested and deleted
 *   scheduled   set to go at `scheduledFor` (step 2)
 *   sending     handed to Mailchimp (step 2)
 *   sent        gone to the list (step 2)
 *   failed      didn't go; `reason` says why (step 2)
 */
import { oneOffNotReady } from "../../../../../shared/email/one-off.js";
import { cleanSections } from "../../../../../shared/email/sections.js";

export const ONE_OFF_STATUSES = ["draft", "scheduled", "sending", "sent", "failed"];

export const SUBJECT_MAX = 150;
export const PREVIEW_MAX = 200;

const text = (value) => String(value ?? "");
const oneLine = (value, max) => text(value).replace(/\s+/g, " ").trim().slice(0, max);

/**
 * A whole email record, every field present and in its type.
 * @param {Record<string, any>} fields
 */
export function oneOffEmail(fields = {}) {
  return {
    id: Number(fields.id) || 0,
    subject: oneLine(fields.subject, SUBJECT_MAX),
    previewText: oneLine(fields.previewText, PREVIEW_MAX),
    sections: cleanSections(fields.sections),
    status: ONE_OFF_STATUSES.includes(fields.status) ? fields.status : "draft",
    campaignId: text(fields.campaignId),
    campaignWebId: text(fields.campaignWebId),
    recipients: Math.max(0, Number(fields.recipients) || 0),
    reason: text(fields.reason),
    createdBy: text(fields.createdBy).trim().toLowerCase(),
    updatedBy: text(fields.updatedBy).trim().toLowerCase(),
    createdAt: text(fields.createdAt),
    updatedAt: text(fields.updatedAt),
    scheduledFor: text(fields.scheduledFor) || null,
    sentAt: text(fields.sentAt) || null,
  };
}

/** What the editor may change, cleaned; anything else in `patch` is ignored. */
export function draftChange(patch = {}) {
  const change = {};
  if (patch.subject !== undefined) change.subject = oneLine(patch.subject, SUBJECT_MAX);
  if (patch.previewText !== undefined) change.previewText = oneLine(patch.previewText, PREVIEW_MAX);
  if (patch.sections !== undefined) change.sections = cleanSections(patch.sections);
  return change;
}

/** Only a draft can be changed or deleted. */
export function isEditable(email) {
  return email?.status === "draft";
}

/** Why it can't be sent anywhere yet (a test or the list), or "" when it can. */
export const notReadyReason = oneOffNotReady;
