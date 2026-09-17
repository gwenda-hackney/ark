import {
  fetchFormForSubmit,
  replyToFromAnswers,
} from "../../_lib/form-submit.js";
import { sendFormNotificationEmail } from "../../_lib/form-email.js";
import { parseFormVerifyToken } from "../../_lib/form-verify-auth.js";
import {
  draftAnswersFromSubmission,
  fetchFormSubmissionRow,
  markFormSubmissionVerified,
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
        formPath: `/forms/${parsed.slug}`,
      },
      400,
    );
  }

  const form = await fetchFormForSubmit(context.env, parsed.slug);
  const successTitle = form?.successTitle || "You're confirmed";
  const successMessage =
    form?.successMessage || "Thanks for writing. We'll be in touch.";
  const formPath = marked.formSlug
    ? `/forms/${marked.formSlug}`
    : `/forms/${parsed.slug}`;

  if (!marked.already) {
    try {
      const notifyForm = form || {
        title: marked.formTitle || parsed.slug,
        slug: parsed.slug,
        notifyEmail: undefined,
      };
      if (form?.notifyEmail) {
        await sendFormNotificationEmail(context.env, {
          form: notifyForm,
          answers: marked.answers,
          submittedAt: marked.submittedAt,
        });
      }
    } catch (error) {
      console.error("Form staff notify after verify failed", error);
    }
  }

  const loaded = await fetchFormSubmissionRow(context.env, parsed.rowId);
  const draftAnswers = loaded.ok
    ? draftAnswersFromSubmission(loaded.row)
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
 * @param {Record<string, string | undefined>} env
 * @param {{
 *   reason?: string,
 *   rowId?: string,
 *   email?: string,
 *   slug?: string,
 * }} claims
 */
async function draftExtrasForClaims(env, claims) {
  const slug = typeof claims.slug === "string" ? claims.slug.trim() : "";
  const rowId = typeof claims.rowId === "string" ? claims.rowId.trim() : "";
  /** @type {{ formPath?: string, draftAnswers?: Record<string, string | string[]> }} */
  const extras = {};
  if (slug && /^[a-z0-9-]+$/i.test(slug)) {
    extras.formPath = `/forms/${slug}`;
  }
  if (!rowId) return extras;

  const loaded = await fetchFormSubmissionRow(env, rowId);
  if (!loaded.ok) return extras;

  const draftAnswers = draftAnswersFromSubmission(loaded.row);
  if (draftAnswers && Object.keys(draftAnswers).length > 0) {
    extras.draftAnswers = draftAnswers;
  }
  if (!extras.formPath) {
    const rowSlug = String(loaded.row["Form Slug"] ?? "").trim();
    if (rowSlug && /^[a-z0-9-]+$/i.test(rowSlug)) {
      extras.formPath = `/forms/${rowSlug}`;
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
