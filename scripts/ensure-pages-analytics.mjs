/**
 * Enable Cloudflare Pages built-in Web Analytics (beacon injected on deploy).
 *
 * Prefer this over a manual HTML embed — injection uses same-origin /cdn-cgi/rum
 * on the live domain and avoids cloudflareinsights.com CORS/404 issues.
 *
 * Env:
 *   WEB_ANALYTICS_ENABLED — "true" for production, "false" for staging
 *   WEB_ANALYTICS_TOKEN   — beacon token (required when enabled)
 *   PAGES_PROJECT_NAME
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = process.env.PAGES_PROJECT_NAME;
const ENABLED = process.env.WEB_ANALYTICS_ENABLED === "true";
const TOKEN = process.env.WEB_ANALYTICS_TOKEN?.trim();

if (!ACCOUNT_ID || !API_TOKEN || !PROJECT) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or PAGES_PROJECT_NAME",
  );
  process.exit(1);
}

if (ENABLED && !TOKEN) {
  console.error("WEB_ANALYTICS_TOKEN is required when WEB_ANALYTICS_ENABLED=true");
  process.exit(1);
}

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(msg);
  }
  return data.result;
}

const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);
const buildConfig = { ...(project.build_config ?? {}) };

if (ENABLED) {
  buildConfig.web_analytics_token = TOKEN;
  if (!buildConfig.web_analytics_tag) {
    buildConfig.web_analytics_tag = PROJECT;
  }
} else {
  buildConfig.web_analytics_token = null;
  buildConfig.web_analytics_tag = null;
}

await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`, {
  method: "PATCH",
  body: { build_config: buildConfig },
});

if (ENABLED) {
  console.log(
    `Enabled Pages Web Analytics on "${PROJECT}" (injected on deploy). Redeploy for beacon to appear.`,
  );
} else {
  console.log(`Disabled Pages Web Analytics on "${PROJECT}".`);
}
