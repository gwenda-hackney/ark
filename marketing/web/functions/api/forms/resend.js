import { validateSubscribeRequest } from "../../_lib/subscribe-auth.js";
import { isFormHoneypotTripped } from "../../_lib/form-honeypot.js";
import { EMAIL_RE } from "../../../../../shared/forms/field-rules.js";
import { sendFormVerifyEmail } from "../../_lib/form-verify-email.js";
import { verifyFormResendToken } from "../../_lib/form-verify-auth.js";
import {
  FORM_STATUS_PENDING,
  fetchFormSubmissionRow,
  formSubmissionStatus,
  updateFormSubmissionEmail,
} from "../../_lib/form-store.js";
import { fetchFormForSubmit } from "../../_lib/form-submit.js";
import { reportFormError } from "../../../../../shared/forms/form-alert.js";
import { requestFields } from "../../../../../shared/log.js";

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

  const rowId = typeof body.rowId === "string" ? body.rowId.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const resendToken =
    typeof body.resendToken === "string" ? body.resendToken.trim() : "";

  if (!rowId || !slug || !email) {
    return json({ error: "Missing details." }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: "Enter a valid email." }, 400);
  }

  const tokenOk = await verifyFormResendToken(context.env, {
    rowId,
    slug,
    token: resendToken,
  });
  if (!tokenOk) {
    return json(
      { error: "This session isn't valid. Submit the form again." },
      403,
    );
  }

  const form = await fetchFormForSubmit(context.env, slug);
  if (!form || !form.requireEmailVerification) {
    return json({ error: "This form isn't available." }, 404);
  }

  const loaded = await fetchFormSubmissionRow(context.env, rowId);
  if (!loaded.ok) {
    return json({ error: loaded.error }, 404);
  }

  const status = formSubmissionStatus(loaded.row);
  if (status === "Verified") {
    return json({ ok: true, alreadyVerified: true });
  }
  if (status && status !== FORM_STATUS_PENDING) {
    return json({ error: "This submission can't be updated." }, 400);
  }

  const rowSlug = String(loaded.row["Form Slug"] ?? "");
  if (rowSlug && rowSlug !== slug) {
    return json({ error: "This session isn't valid." }, 403);
  }

  const updated = await updateFormSubmissionEmail(context.env, rowId, email);
  if (!updated.ok) {
    return json({ error: updated.error }, 502);
  }

  try {
    const sent = await sendFormVerifyEmail(context.env, {
      form,
      email,
      rowId,
      requestUrl: context.request.url,
    });
    if (!sent.ok && !sent.skipped && !sent.dryRun) {
      return json({ error: "Could not send confirmation. Try again?" }, 502);
    }
    if (sent.skipped) {
      return json({ error: "Could not send confirmation. Try again?" }, 503);
    }
  } catch (error) {
    await reportFormError(context.env, "form_verify_resend_failed", {
      ...requestFields(context.request),
      slug,
      rowId,
      error,
    });
    return json({ error: "Could not send confirmation. Try again?" }, 502);
  }

  return json({
    ok: true,
    email,
    verifyPendingTitle: form.verifyPendingTitle || "Check your email",
    verifyPendingMessage:
      form.verifyPendingMessage ||
      "We sent a link to {email}. Open it to finish (valid for 48 hours).",
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
