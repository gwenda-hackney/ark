import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { deleteSeason, getSeason, saveSeason } from "../../../src/seasons/server/seasons.js";
import { problemResponse } from "../../../src/seasons/server/problem-response.js";

const seasonId = (context) => Number(context.params?.id);

export const onRequestGet = withApiHandler(async (context) => jsonResponse(await getSeason(context.env, seasonId(context))));

/** Save a season's words and days (#353); its picture stays as it is. */
export const onRequestPut = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body?.season || typeof body.season !== "object") return jsonResponse({ error: "Send the season as season." }, 400);
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return problemResponse(async () =>
    jsonResponse({ ok: true, ...(await saveSeason(context.env, body.season, { id: seasonId(context), by })) }),
  );
});

export const onRequestDelete = withApiHandler(async (context) =>
  jsonResponse(await deleteSeason(context.env, seasonId(context))),
);
