/**
 * Ops-only: resend one email for a stored form submission and stamp the row.
 * POST { rowId, kind: "notify" | "receipt" } with Bearer FORMS_ADMIN_SECRET.
 */
import {
  eventAdminUnauthorized,
  verifyFormsAdminRequest,
} from "../../../_lib/event-admin-auth.js";
import {
  sendFormNotificationEmail,
  sendFormReceiptEmail,
} from "../../../_lib/form-email.js";
import {
  FORM_EMAIL_SENT_FIELDS,
  fetchFormSubmissionRow,
  markFormSubmissionEmailSent,
  parseFormSubmissionAnswers,
} from "../../../_lib/form-store.js";
import { fetchFormForSubmit } from "../../../_lib/form-submit.js";
import {
  buildFormEditUrl,
  createFormEditToken,
} from "../../../_lib/form-verify-auth.js";
import { formPublicPath } from "../../../_lib/form-paths.js";
import { resolvePublicOrigin } from "../../../_lib/public-origin.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!verifyFormsAdminRequest(request, env)) {
    return eventAdminUnauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const rowId = String(body?.rowId ?? "").trim();
  const kind = String(body?.kind ?? "").trim();
  if (!rowId || !Object.hasOwn(FORM_EMAIL_SENT_FIELDS, kind)) {
    return json({ error: "Expected rowId and kind (notify or receipt)." }, 400);
  }

  const loaded = await fetchFormSubmissionRow(env, rowId);
  if (!loaded.ok) {
    const status = loaded.error === "Submission not found." ? 404 : 502;
    return json({ error: loaded.error }, status);
  }

  const { row } = loaded;
  const slug = String(row["Form Slug"] ?? "").trim();
  const form = slug ? await fetchFormForSubmit(env, slug) : null;
  if (!form) {
    return json({ error: `Form "${slug}" is not in Sanity.` }, 404);
  }
  const answers = parseFormSubmissionAnswers(row);

  let sent;
  if (kind === "notify") {
    sent = await sendFormNotificationEmail(env, { form, answers });
  } else {
    const email = String(row["Reply To"] ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      return json({ error: "Submission has no reply-to email." }, 400);
    }
    const token = await createFormEditToken(env, { rowId, email, slug });
    const origin = resolvePublicOrigin(new URL(request.url).origin, env);
    const editUrl =
      (await buildFormEditUrl(request.url, env, token)) ||
      `${origin.replace(/\/$/, "")}${formPublicPath(slug)}`;
    sent = await sendFormReceiptEmail(env, { form, answers, email, editUrl });
  }

  if (!sent.ok) {
    return json({ error: sent.error || "Could not send." }, 502);
  }
  if (sent.dryRun) {
    return json({ ok: true, dryRun: true });
  }

  const marked = await markFormSubmissionEmailSent(env, rowId, kind);
  return json({
    ok: true,
    sentAt: marked.ok ? marked.sentAt : null,
    ...(marked.ok ? {} : { warning: marked.error }),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
