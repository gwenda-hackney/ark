import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { deleteOccasion, getOccasion, saveOccasion } from "../../../src/occasions/server/occasions.js";
import { problemResponse } from "../../../src/occasions/server/problem-response.js";

const occasionId = (context) => Number(context.params?.id);

export const onRequestGet = withApiHandler(async (context) => jsonResponse(await getOccasion(context.env, occasionId(context))));

/** Save an occasion's words and days (#353); its picture stays as it is. */
export const onRequestPut = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body?.occasion || typeof body.occasion !== "object") return jsonResponse({ error: "Send the occasion as occasion." }, 400);
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return problemResponse(async () =>
    jsonResponse({ ok: true, ...(await saveOccasion(context.env, body.occasion, { id: occasionId(context), by })) }),
  );
});

export const onRequestDelete = withApiHandler(async (context) =>
  jsonResponse(await deleteOccasion(context.env, occasionId(context))),
);
