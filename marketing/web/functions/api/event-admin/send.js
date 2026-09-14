import {
  eventAdminUnauthorized,
  verifyEventAdminRequest,
} from "../../_lib/event-admin-auth.js";
import { sendEventInvites } from "../../_lib/invite-send.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  if (!verifyEventAdminRequest(context.request, context.env)) {
    return eventAdminUnauthorized();
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const slug = payload?.slug?.trim();
  if (!slug) return json({ error: "Missing slug." }, 400);

  const dryRun = Boolean(payload?.dryRun);

  try {
    const result = await sendEventInvites(context.env, slug, { dryRun });
    if (!result.ok) return json({ error: result.error }, result.status);
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed.";
    return json({ error: message }, 502);
  }
}
