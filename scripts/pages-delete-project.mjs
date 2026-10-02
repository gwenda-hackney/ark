#!/usr/bin/env node
/**
 * Delete a Cloudflare Pages project that has too many deployments for the
 * dashboard or `wrangler pages project delete` (Cloudflare known issue): its
 * deployments go first, then the project. Refuses a project that serves a
 * custom domain, so a live site (gwenda.co.uk, operations.) can't be deleted
 * this way. Says what it would do; --apply deletes.
 *
 * Uses CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from the environment, so
 * run it inside the account's wrapper:
 *
 *   node scripts/with-production-cloudflare.mjs node scripts/pages-delete-project.mjs --project NAME [--apply]
 *   node scripts/with-env.mjs node scripts/pages-delete-project.mjs --project NAME [--apply]   # gwenda-dev
 */
const API = "https://api.cloudflare.com/client/v4";
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] || "" : "";
};
const project = arg("--project");
const APPLY = process.argv.includes("--apply");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

async function cf(path, method = "GET") {
  let res;
  // Hundreds of calls in a row: retry Cloudflare's occasional 5xx. Safe to rerun anyway.
  for (let attempt = 1; ; attempt += 1) {
    res = await fetch(`${API}/accounts/${accountId}/pages/projects/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status < 500 || attempt === 4) break;
    await new Promise((done) => setTimeout(done, 2000 * attempt));
  }
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const why =
      (data.errors || []).map((error) => error.message).join("; ") ||
      `HTTP ${res.status}`;
    throw new Error(`Cloudflare ${method} ${path}: ${why}`);
  }
  return data;
}

async function main() {
  if (!project)
    throw new Error("Usage: pages-delete-project.mjs --project NAME [--apply]");
  if (!accountId || !token)
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");

  const { result } = await cf(project);
  const custom = (result.domains || []).filter(
    (domain) => !domain.endsWith(".pages.dev"),
  );
  if (custom.length)
    throw new Error(
      `${project} serves ${custom.join(", ")}. Refusing to delete a live site.`,
    );

  const ids = [];
  for (let page = 1; ; page += 1) {
    const { result: batch, result_info: info } = await cf(
      `${project}/deployments?per_page=25&page=${page}`,
    );
    ids.push(...batch.map((deployment) => deployment.id));
    if (!batch.length || page >= (info?.total_pages || 1)) break;
  }
  if (!APPLY) {
    console.log(
      `Would delete ${ids.length} deployment(s) of ${project}, then the project. Run again with --apply.`,
    );
    return;
  }
  // The live deployment can't be deleted on its own; it goes with the project.
  const live = result.canonical_deployment?.id;
  let deleted = 0;
  for (const id of ids) {
    if (id === live) continue;
    await cf(`${project}/deployments/${id}?force=true`, "DELETE");
    deleted += 1;
    if (deleted % 25 === 0)
      console.log(`  ${deleted}/${ids.length} deployments deleted`);
  }
  await cf(project, "DELETE");
  console.log(`Deleted ${deleted} deployment(s) and the project ${project}.`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
