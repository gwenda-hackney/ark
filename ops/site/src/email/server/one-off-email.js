/**
 * Use cases of one-off emails (#348): write one in ops, keep it as a draft,
 * see it as it would arrive, and send yourself a test. Rules live in
 * one-off-email-model.js, storage behind one-off-email-repository.js, the
 * email itself in shared/email/one-off.js. Sending to the list and
 * scheduling come next (step 2), through the same statuses.
 *
 * Who can reach what: anyone signed in writes, changes, deletes a draft and
 * tests it to their own address.
 */
import { renderOneOffEmail } from "../../../../../shared/email/one-off.js";
import { readImageUpload, uploadImage } from "../../platform/image-upload.js";
import { sectionImageUrl } from "../../../../../shared/email/sections.js";
import { emailAccess } from "./weekly-email.js";
import { emailFrame } from "./email-frame.js";
import { notReadyReason } from "./one-off-email-model.js";
import { oneOffEmailRepository } from "./one-off-email-repository.js";
import { refusal, sendTestToAddress } from "./test-send.js";

const NOT_FOUND = "That email isn't here any more.";
const NOT_A_DRAFT = "It has been sent or scheduled, so it can't be changed.";

/** Every one-off email, newest change first, with its sections: the overview draws each card's little preview from them. */
export async function listOneOffEmails(env) {
  const emails = await oneOffEmailRepository(env).list(200);
  return { emails: emails.map((email) => ({ ...email, sectionCount: email.sections.length })) };
}

/** One email, with the frame the page draws its preview in and what can be done here. */
export async function getOneOffEmail(env, id) {
  const email = await oneOffEmailRepository(env).get(id);
  if (!email) throw refusal(404, NOT_FOUND);
  return { email, frame: emailFrame(env), access: emailAccess(env) };
}

/** The frame and access alone, for a new email not saved yet. */
export function oneOffEmailContext(env) {
  return { frame: emailFrame(env), access: emailAccess(env) };
}

/** New email: a draft from what the editor has so far. */
export async function createOneOffEmail(env, fields, { by = "", now = new Date() } = {}) {
  return oneOffEmailRepository(env).create({ ...fields, by, now });
}

/** Save: a draft's name, subject, preview line and sections. */
export async function saveOneOffEmail(env, id, change, { by = "", now = new Date() } = {}) {
  const repo = oneOffEmailRepository(env);
  const saved = await repo.updateDraft(id, change, { by, now });
  if (saved) return saved;
  throw (await repo.get(id)) ? refusal(409, NOT_A_DRAFT) : refusal(404, NOT_FOUND);
}

/** Delete: a draft only. */
export async function deleteOneOffEmail(env, id) {
  const repo = oneOffEmailRepository(env);
  if (await repo.removeDraft(id)) return { deleted: true };
  throw (await repo.get(id)) ? refusal(409, "It has been sent or scheduled, so it can't be deleted.") : refusal(404, NOT_FOUND);
}

/** A picture for an Image section: uploaded to Sanity, where the website's pictures are. */
export async function uploadOneOffImage(env, form) {
  const upload = await readImageUpload(form, "email.jpg");
  const assetId = await uploadImage(env, upload);
  return { assetId, url: sectionImageUrl(assetId, emailFrame(env).images) };
}

/** The email as Mailchimp would send it, built from what's saved. */
export function buildOneOffEmail(env, email) {
  return renderOneOffEmail(email, emailFrame(env));
}

/**
 * Send me a test: the saved email to the signed-in person's own address
 * (`email` from their session, never the page). Counted with the weekly
 * email's tests (test-send.js).
 */
export async function sendOneOffTest(env, id, { email, now = new Date() }) {
  const saved = await oneOffEmailRepository(env).get(id);
  if (!saved) throw refusal(404, NOT_FOUND);
  const notReady = notReadyReason(saved);
  if (notReady) throw refusal(409, notReady);
  return sendTestToAddress(env, {
    email,
    now,
    title: `Test: ${saved.subject} (safe to delete)`,
    build: async () => buildOneOffEmail(env, saved),
  });
}
