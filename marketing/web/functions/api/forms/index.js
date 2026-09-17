import {
  issueSubscribeTokens,
  validateSubscribeRequest,
} from "../../_lib/subscribe-auth.js";
import { isFormHoneypotTripped } from "../../_lib/form-honeypot.js";
import { sendFormNotificationEmail } from "../../_lib/form-email.js";
import { sendFormVerifyEmail } from "../../_lib/form-verify-email.js";
import { createFormResendToken } from "../../_lib/form-verify-auth.js";
import {
  FORM_STATUS_PENDING,
  FORM_STATUS_VERIFIED,
  findFormSubmissionByEmail,
  formSubmissionStatus,
  upsertFormSubmission,
} from "../../_lib/form-store.js";
import {
  fetchFormForSubmit,
  replyToFromAnswers,
  validateFormAnswers,
} from "../../_lib/form-submit.js";

export async function onRequestGet(context) {
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

  const requireVerify = Boolean(form.requireEmailVerification);
  const replyTo = replyToFromAnswers(validated.answers);

  if (requireVerify && !replyTo) {
    return json(
      { error: "Please enter a valid email so we can confirm it." },
      400,
    );
  }

  let priorStatus = "";
  if (requireVerify && replyTo) {
    const existing = await findFormSubmissionByEmail(context.env, {
      slug,
      email: replyTo,
    });
    if (!existing.ok) {
      return json(
        { error: existing.error || "Could not save. Try again?" },
        502,
      );
    }
    priorStatus = existing.row ? formSubmissionStatus(existing.row) : "";
  }

  const submittedAt = new Date().toISOString();
  // Already-verified emails keep Verified on upsert (edit in place).
  // New / pending emails stay Pending until the magic link is opened.
  const alreadyVerified = priorStatus === FORM_STATUS_VERIFIED;
  const status =
    requireVerify && !alreadyVerified
      ? FORM_STATUS_PENDING
      : FORM_STATUS_VERIFIED;

  let rowId;
  let updated = false;
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
      status,
    });
    if (!stored.ok) {
      return json({ error: stored.error || "Could not save. Try again?" }, 502);
    }
    rowId = stored.rowId;
    updated = Boolean(stored.updated);
  } catch (error) {
    console.error("Form submission upsert failed", error);
    return json({ error: "Could not save. Try again?" }, 502);
  }

  if (requireVerify && alreadyVerified) {
    try {
      await sendFormNotificationEmail(context.env, {
        form,
        answers: validated.answers,
        submittedAt,
      });
    } catch (error) {
      console.error("Form staff notify on verified update failed", error);
    }

    return json({
      ok: true,
      alreadyVerified: true,
      updated: true,
      rowId,
      email: replyTo,
      successTitle: form.successTitle || "You're confirmed",
      successMessage:
        form.successMessage ||
        "We've updated your submission. Open the link from your email anytime to review it again.",
    });
  }

  if (requireVerify) {
    try {
      const sent = await sendFormVerifyEmail(context.env, {
        form,
        email: replyTo,
        rowId,
        requestUrl: context.request.url,
        updated,
      });
      if (!sent.ok && !sent.skipped && !sent.dryRun) {
        console.error(
          JSON.stringify({
            event: "form_verify_failed_after_store",
            rowId,
            slug,
            error: sent.error || "unknown",
          }),
        );
        return json({ error: "Could not send confirmation. Try again?" }, 502);
      }
      if (sent.skipped) {
        console.error(
          JSON.stringify({
            event: "form_verify_skipped_after_store",
            rowId,
            slug,
            error: sent.error || "smtp_not_configured",
          }),
        );
        return json({ error: "Could not send confirmation. Try again?" }, 503);
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "form_verify_exception_after_store",
          rowId,
          slug,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json({ error: "Could not send confirmation. Try again?" }, 502);
    }

    const resendToken = await createFormResendToken(context.env, {
      rowId,
      slug,
    });

    return json({
      ok: true,
      pendingVerification: true,
      updated,
      rowId,
      email: replyTo,
      resendToken,
      verifyPendingTitle: form.verifyPendingTitle || "Check your email",
      verifyPendingMessage:
        form.verifyPendingMessage ||
        "We sent a link to {email}. Open it to finish (valid for 48 hours).",
    });
  }

  try {
    const sent = await sendFormNotificationEmail(context.env, {
      form,
      answers: validated.answers,
      submittedAt,
    });
    if (!sent.ok && !sent.skipped) {
      console.error(
        JSON.stringify({
          event: "form_notify_failed_after_store",
          slug,
          error: sent.error || "unknown",
        }),
      );
    }
  } catch (error) {
    console.error("Form staff notify failed", error);
  }

  return json({
    ok: true,
    pendingVerification: false,
    updated,
    successTitle: form.successTitle,
    successMessage: form.successMessage,
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
