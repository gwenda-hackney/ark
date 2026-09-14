import { getEventRsvp, saveRsvpResponse } from "../_lib/rsvp.js";
import { jsonResponse, withApiHandler } from "../_lib/api-handler.js";
import { readEventPasswordFromSearchParams } from "../_lib/event-password.js";

export const onRequestGet = withApiHandler(async (context) => {
  const params = new URL(context.request.url).searchParams;
  const result = await getEventRsvp(
    context.env,
    params.get("slug"),
    readEventPasswordFromSearchParams(params),
  );
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }
  return jsonResponse({ ok: true, event: result.event, source: result.source });
});

export const onRequestPost = withApiHandler(async (context) => {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid request." }, 400);
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
    return jsonResponse({ error: result.error }, result.status);
  }

  return jsonResponse({
    ok: true,
    attending: result.attending,
    name: result.name ?? null,
    rsvpGuests: result.rsvpGuests,
    source: result.source,
    event: result.event,
    ticketUrl: result.ticketUrl ?? null,
  });
});
