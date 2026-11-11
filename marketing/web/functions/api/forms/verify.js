import { fetchFormForSubmit } from "../../_lib/form-submit.js";
import { replyToFromAnswers } from "../../../../../shared/forms/format.js";
import { formPublicPath } from "../../_lib/form-paths.js";
import { parseFormVerifyToken } from "../../_lib/form-verify-auth.js";
import {
  draftAnswersFromSubmission,
  fetchFormSubmission,
  markFormSubmissionVerified,
  submissionBelongsTo,
} from "../../_lib/form-store.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const token = url.searchParams.get("t") || "";

  const parsed = await parseFormVerifyToken(context.env, token);
  if (!parsed.ok) {
    const message =
      parsed.reason === "expired"
        ? "This link has expired. Submit the form again."
        : "This link isn't valid.";
    const extras = await draftExtrasForClaims(context.env, parsed);
    return json(
      { ok: false, reason: parsed.reason, error: message, ...extras },
      400,
    );
  }

  const marked = await markFormSubmissionVerified(
    context.env,
    parsed.rowId,
    parsed.email,
  );
  if (!marked.ok) {
    const extras = await draftExtrasForClaims(context.env, parsed);
    return json({ ok: false, error: marked.error, ...extras }, 400);
  }

  if (marked.formSlug && marked.formSlug !== parsed.slug) {
    return json(
      {
        ok: false,
        error: "This link isn't valid.",
        formPath: formPublicPath(parsed.slug),
      },
      400,
    );
  }

  const form = await fetchFormForSubmit(context.env, parsed.slug);
  const successTitle = form?.successTitle || "You're confirmed";
  const successMessage =
    form?.successMessage || "Thanks for writing. We'll be in touch.";
  const formPath = formPublicPath(marked.formSlug || parsed.slug);

  // Ops were notified on submit; verifying only flips the status.

  // markFormSubmissionVerified has checked the row is this link's sender's.
  const loaded = await fetchFormSubmission(context.env, parsed.rowId);
  const draftAnswers =
    loaded.ok && submissionBelongsTo(loaded.submission, parsed.email)
      ? draftAnswersFromSubmission(loaded.submission)
      : Object.fromEntries(
          (marked.answers || [])
            .filter((row) => row?.key)
            .map((row) => [row.key, row.value ?? ""]),
        );

  return json({
    ok: true,
    already: Boolean(marked.already),
    successTitle,
    successMessage,
    formPath,
    draftAnswers:
      draftAnswers && Object.keys(draftAnswers).length > 0
        ? draftAnswers
        : undefined,
    email: replyToFromAnswers(marked.answers) || parsed.email,
  });
}

/**
 * What a link that can't confirm still gives back: the form's address and,
 * to its own sender only, their answers to fill the form in again.
 * @param {Record<string, string | undefined>} env
 * @param {{
 *   ok: boolean,
 *   reason?: string,
 *   rowId?: string,
 *   email?: string,
 *   slug?: string,
 * }} claims  from parseFormVerifyToken
 */
async function draftExtrasForClaims(env, claims) {
  const slug = typeof claims.slug === "string" ? claims.slug.trim() : "";
  const rowId = typeof claims.rowId === "string" ? claims.rowId.trim() : "";
  /** @type {{ formPath?: string, draftAnswers?: Record<string, string | string[]> }} */
  const extras = {};
  if (slug && /^[a-z0-9-]+$/i.test(slug)) {
    extras.formPath = formPublicPath(slug);
  }
  // Only a link this site signed (expired is fine) may look a row up.
  const signed = claims.ok === true || claims.reason === "expired";
  if (!signed || !rowId) return extras;

  const loaded = await fetchFormSubmission(env, rowId);
  if (!loaded.ok) return extras;
  if (!submissionBelongsTo(loaded.submission, claims.email)) return extras;

  const draftAnswers = draftAnswersFromSubmission(loaded.submission);
  if (draftAnswers && Object.keys(draftAnswers).length > 0) {
    extras.draftAnswers = draftAnswers;
  }
  if (!extras.formPath) {
    const rowSlug = loaded.submission.formSlug;
    if (rowSlug && /^[a-z0-9-]+$/i.test(rowSlug)) {
      extras.formPath = formPublicPath(rowSlug);
    }
  }
  return extras;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
