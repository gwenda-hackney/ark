/** Liveness: Pages Functions ran. Do not probe Baserow or SMTP. */

export async function onRequestGet(context) {
  const env = context?.env || {};
  return json({
    ok: true,
    service: "gwenda",
    env: env.SITE_ENV || null,
    dataset: env.SANITY_DATASET || null,
    commit: env.CF_PAGES_COMMIT_SHA || null,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
