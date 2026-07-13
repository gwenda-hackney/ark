import { fetchPublishedEvents } from "../_lib/sanity-events.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function onRequestGet(context) {
  const events = await fetchPublishedEvents(context.env);
  return json({ ok: true, events });
}
