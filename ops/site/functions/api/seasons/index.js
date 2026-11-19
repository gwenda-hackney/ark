import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { listSeasons, saveSeason } from "../../../src/seasons/server/seasons.js";
import { problemResponse } from "../../../src/seasons/server/problem-response.js";

/** Every season (#353), and where they stand on the website. */
export const onRequestGet = withApiHandler(async (context) => jsonResponse(await listSeasons(context.env)));

/** A new season; it goes on the website as a saved event does. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body?.season || typeof body.season !== "object") return jsonResponse({ error: "Send the season as season." }, 400);
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return problemResponse(async () => jsonResponse({ ok: true, ...(await saveSeason(context.env, body.season, { by })) }));
});
