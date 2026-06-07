import { subscribeEmail } from "../_lib/subscribe.js";

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
