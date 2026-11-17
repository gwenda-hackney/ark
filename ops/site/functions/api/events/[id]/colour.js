import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { setEventAccentColor } from "../../../../src/events/server/event-store.js";

/** A pop-up kitchen's own colour (#319): PUT { accentColor: "#0f4d32" }, or "" for none. */
export const onRequestPut = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const event = await setEventAccentColor(context.env, id, body.accentColor);
  return jsonResponse({ ok: true, event });
});
