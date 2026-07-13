import { getInviteByToken, saveRsvpGuests } from "../_lib/rsvp.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  const token = new URL(context.request.url).searchParams.get("token");
  if (!token) {
    return json({ error: "Missing invite token." }, 400);
  }

  const result = await getInviteByToken(context.env, token);
  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }

  return json({
    ok: true,
    name: result.guest.name,
    rsvpGuests: result.guest.rsvpGuests,
    event: result.event,
  });
}

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const token = payload?.token;
  const guests = payload?.guests;

  if (typeof token !== "string" || guests === undefined) {
    return json({ error: "Missing token or guest count." }, 400);
  }

  const parsed =
    typeof guests === "number" ? guests : Number.parseInt(String(guests), 10);

  const result = await saveRsvpGuests(context.env, token, parsed);
  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }

  return json({
    ok: true,
    name: result.guest.name,
    rsvpGuests: result.guest.rsvpGuests,
    event: result.event,
  });
}
