import {
  issueSubscribeTokens,
  validateSubscribeRequest,
} from "../../_lib/subscribe-auth.js";
import { isFormHoneypotTripped } from "../../_lib/form-honeypot.js";
import {
  sendFormNotificationEmail,
  sendFormReceiptEmail,
} from "../../_lib/form-email.js";
import {
  FORM_STATUS_VERIFIED,
  markFormSubmissionEmailSent,
  upsertFormSubmission,
} from "../../_lib/form-store.js";
import { reportFormError } from "../../_lib/form-alert.js";
import { requestFields } from "../../_lib/log.js";
import { formPublicPath } from "../../_lib/form-paths.js";
import {
  fetchFormForSubmit,
  replyToFromAnswers,
  validateFormAnswers,
} from "../../_lib/form-submit.js";
import {
  buildFormEditUrl,
  createFormEditToken,
} from "../../_lib/form-verify-auth.js";
import {
  FORM_RATE_LIMITS,
  checkFormRateLimit,
  formRateLimitResponse,
} from "../../_lib/form-rate-limit.js";
import { resolvePublicOrigin } from "../../_lib/public-origin.js";

export async function onRequestGet(context) {
  const limited = await checkFormRateLimit(
    context.request,
    FORM_RATE_LIMITS.csrf,
  );
  if (!limited.ok) {
    return formRateLimitResponse(limited.retryAfterSec);
  }

  const secure = new URL(context.request.url).protocol === "https:";
  const issued = issueSubscribeTokens(context.env, { secure });

  if (issued.kind === "error") {
    return json({ error: issued.error }, issued.status);
  }

  return json({ csrfToken: issued.csrfToken, secret: issued.secret }, 200, {
    "Set-Cookie": issued.setCookie,
  });
}

export async function onRequestPost(context) {
  const limited = await checkFormRateLimit(
    context.request,
    FORM_RATE_LIMITS.submit,
  );
  if (!limited.ok) {
    return formRateLimitResponse(limited.retryAfterSec);
  }

  const auth = validateSubscribeRequest(context.request, context.env);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (isFormHoneypotTripped(body)) {
    return json({ ok: true });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) {
    return json({ error: "Missing form." }, 400);
  }

  const form = await fetchFormForSubmit(context.env, slug);
  if (!form) {
    return json({ error: "This form isn't available." }, 404);
  }

  const validated = validateFormAnswers(form, body.answers);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  const replyTo = replyToFromAnswers(validated.answers);
  if (!replyTo) {
    return json({ error: "Please enter a valid email." }, 400);
  }

  const submittedAt = new Date().toISOString();

  let rowId;
  let updated = false;
  /** @type {Array<{ key: string, label: string, from: string, to: string }> | undefined} */
  let changes;
  try {
    const stored = await upsertFormSubmission(context.env, {
      form,
      answers: validated.answers,
      rawAnswers:
        body.answers &&
        typeof body.answers === "object" &&
        !Array.isArray(body.answers)
          ? body.answers
          : undefined,
      submittedAt,
      status: FORM_STATUS_VERIFIED,
    });
    if (!stored.ok) {
      return json({ error: stored.error || "Could not save. Try again?" }, 502);
    }
    rowId = stored.rowId;
    updated = Boolean(stored.updated);
    changes = stored.changes;
  } catch (error) {
    await reportFormError(context.env, "form_store_failed", {
      ...requestFields(context.request),
      op: "upsert",
      slug,
      error,
    });
    return json({ error: "Could not save. Try again?" }, 502);
  }

  const origin = resolvePublicOrigin(
    new URL(context.request.url).origin,
    context.env,
  );
  const editToken = await createFormEditToken(context.env, {
    rowId,
    email: replyTo,
    slug,
  });
  const editUrl =
    (await buildFormEditUrl(context.request.url, context.env, editToken)) ||
    `${origin.replace(/\/$/, "")}${formPublicPath(slug)}`;

  try {
    const sent = await sendFormNotificationEmail(context.env, {
      form,
      answers: validated.answers,
      changes: updated ? changes : undefined,
      updated,
    });
    if (sent.ok && !sent.dryRun) {
      await markFormSubmissionEmailSent(context.env, rowId, "notify");
    }
    if (!sent.ok && !sent.skipped) {
      await reportFormError(context.env, "form_notify_failed_after_store", {
        ...requestFields(context.request),
        slug,
        error: sent.error || "unknown",
      });
    }
  } catch (error) {
    await reportFormError(context.env, "form_notify_failed_after_store", {
      ...requestFields(context.request),
      slug,
      error,
    });
  }

  try {
    const receipt = await sendFormReceiptEmail(context.env, {
      form,
      answers: validated.answers,
      email: replyTo,
      editUrl,
      updated,
    });
    if (receipt.ok && !receipt.dryRun) {
      await markFormSubmissionEmailSent(context.env, rowId, "receipt");
    }
    if (!receipt.ok && !receipt.skipped && !receipt.dryRun) {
      await reportFormError(context.env, "form_receipt_failed_after_store", {
        ...requestFields(context.request),
        slug,
        rowId,
        error: receipt.error || "unknown",
      });
    }
  } catch (error) {
    await reportFormError(context.env, "form_receipt_failed_after_store", {
      ...requestFields(context.request),
      slug,
      rowId,
      error,
    });
  }

  return json({
    ok: true,
    pendingVerification: false,
    updated,
    rowId,
    email: replyTo,
    successTitle: form.successTitle || "Got it",
    successMessage:
      form.successMessage ||
      "Thanks for writing. Our team will get in touch with you shortly.",
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
