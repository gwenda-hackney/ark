import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/admin.js";
import { compareDatabasePair, databasePairs } from "../../_lib/db-diff.js";
import { dispatchBaserowCopy } from "../../_lib/site-deploy.js";

const COPY_TARGETS = { ops: "ops-dev", website: "website-staging" };

/** GET ?pair=ops|website compares one pair; without it, lists the pairs. */
export const onRequestGet = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  const pair = new URL(context.request.url).searchParams.get("pair");
  if (!pair) {
    const pairs = Object.values(databasePairs(context.env)).map((row) => ({
      id: row.id,
      label: row.label,
      copyLabel: row.copyLabel,
    }));
    return jsonResponse({ ok: true, pairs });
  }
  const result = await compareDatabasePair(context.env, pair);
  return jsonResponse({ ok: true, ...result });
});

/** POST { pair, confirm: pair } copies production over that pair's copy. */
export const onRequestPost = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  const body = await readJsonBody(context.request);
  const pair = String(body?.pair || "");
  const target = COPY_TARGETS[pair];
  if (!target) return jsonResponse({ error: 'pair must be "ops" or "website".' }, 400);
  if (body?.confirm !== pair) {
    return jsonResponse({ error: `Send confirm: "${pair}" to overwrite the copy.` }, 400);
  }
  const run = await dispatchBaserowCopy(context.env, target);
  return jsonResponse({ ok: true, pair, ...run }, 202);
});
