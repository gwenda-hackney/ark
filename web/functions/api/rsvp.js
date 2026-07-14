import { getEventRsvp, saveRsvpResponse } from "../_lib/rsvp.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const params = new URL(context.request.url).searchParams;
  const result = await getEventRsvp(
    context.env,
    params.get("slug"),
    params.get("key"),
  );
  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }
  return json({ ok: true, event: result.event, source: result.source });
}

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const result = await saveRsvpResponse(context.env, {
    slug: payload?.slug,
    token: payload?.token,
    attending: payload?.attending,
    name: payload?.name,
    email: payload?.email,
    guests: payload?.guests,
    origin: new URL(context.request.url).origin,
  });
  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }

  return json({
    ok: true,
    attending: result.attending,
    name: result.name ?? null,
    rsvpGuests: result.rsvpGuests,
    source: result.source,
    event: result.event,
  });
}
