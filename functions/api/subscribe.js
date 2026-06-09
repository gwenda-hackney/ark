import { issueSubscribeTokens, validateSubscribeRequest } from "../_lib/subscribe-auth.js";
import { isSubscribeHoneypotTripped } from "../_lib/subscribe-honeypot.js";
import { subscribeEmail } from "../_lib/subscribe.js";

export async function onRequestGet(context) {
  const secure = new URL(context.request.url).protocol === "https:";
  const issued = issueSubscribeTokens(context.env, { secure });

  if (issued.kind === "error") {
    return json({ error: issued.error }, issued.status);
  }

  return json(
    { csrfToken: issued.csrfToken, secret: issued.secret },
    200,
    { "Set-Cookie": issued.setCookie },
  );
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

  if (isSubscribeHoneypotTripped(body)) {
    return json({ ok: true });
  }

  const result = await subscribeEmail({
    email: body.email,
    tag: body.tag,
    env: context.env,
  });

  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }

  return json({ ok: true });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
