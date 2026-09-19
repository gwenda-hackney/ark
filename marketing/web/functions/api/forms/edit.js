import { formPublicPath } from "../../_lib/form-paths.js";
import { parseFormEditToken } from "../../_lib/form-verify-auth.js";
import {
  draftAnswersFromSubmission,
  fetchFormSubmissionRow,
} from "../../_lib/form-store.js";
import {
  FORM_RATE_LIMITS,
  checkFormRateLimit,
  formRateLimitResponse,
} from "../../_lib/form-rate-limit.js";

/**
 * Prefill draft for "Change your application" links from the receipt email.
 * Does not mutate Baserow status.
 */
export async function onRequestGet(context) {
  const limited = await checkFormRateLimit(
    context.request,
    FORM_RATE_LIMITS.edit,
  );
  if (!limited.ok) {
    return formRateLimitResponse(limited.retryAfterSec);
  }

  const url = new URL(context.request.url);
  const token = url.searchParams.get("t") || "";

  const parsed = await parseFormEditToken(context.env, token);
  if (!parsed.ok) {
    return json(
      {
        ok: false,
        reason: parsed.reason,
        error: "This link isn't valid.",
        formPath: parsed.slug ? formPublicPath(parsed.slug) : undefined,
      },
      400,
    );
  }

  const loaded = await fetchFormSubmissionRow(context.env, parsed.rowId);
  if (!loaded.ok) {
    return json(
      {
        ok: false,
        error: loaded.error || "Submission not found.",
        formPath: formPublicPath(parsed.slug),
      },
      404,
    );
  }

  const row = loaded.row;
  const replyTo = String(row["Reply To"] ?? "")
    .trim()
    .toLowerCase();
  if (replyTo && replyTo !== parsed.email) {
    return json(
      {
        ok: false,
        error: "This link isn't valid.",
        formPath: formPublicPath(parsed.slug),
      },
      400,
    );
  }

  const rowSlug = String(row["Form Slug"] ?? "").trim() || parsed.slug;
  if (rowSlug && rowSlug !== parsed.slug) {
    return json(
      {
        ok: false,
        error: "This link isn't valid.",
        formPath: formPublicPath(parsed.slug),
      },
      400,
    );
  }

  const draftAnswers = draftAnswersFromSubmission(row);
  const formPath = formPublicPath(rowSlug || parsed.slug);

  return json({
    ok: true,
    formPath,
    draftAnswers:
      draftAnswers && Object.keys(draftAnswers).length > 0
        ? draftAnswers
        : undefined,
    email: parsed.email,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
