import { jsonResponse, withApiHandler } from "../../../../../../src/platform/http.js";
import {
  clearOccurrenceImage,
  setOccurrenceImage,
} from "../../../../../../src/events/server/event-store.js";
import { readImageUpload } from "../../../../../../src/events/server/event-images.js";

function params(context) {
  return {
    id: decodeURIComponent(context.params?.id || ""),
    date: decodeURIComponent(context.params?.date || ""),
  };
}

export const onRequestPost = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const upload = await readImageUpload(await context.request.formData(), "event-guest.jpg");
  const result = await setOccurrenceImage(context.env, id, date, upload);
  return jsonResponse({ ok: true, ...result });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const { id, date } = params(context);
  if (!id || !date) {
    return jsonResponse({ error: "Missing event id or occurrence date." }, 400);
  }
  const result = await clearOccurrenceImage(context.env, id, date);
  return jsonResponse({ ok: true, ...result });
});
