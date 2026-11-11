/**
 * The Cloudflare Pages API calls the Pages scripts share: rollback
 * (pages-rollback.mjs), cleanup (pages-cleanup.mjs) and project delete
 * (pages-delete-project.mjs).
 *
 * `api` is { accountId, token, fetchImpl?, retryDelayMs? }; tests pass a fake
 * fetchImpl.
 */

const API = "https://api.cloudflare.com/client/v4";

/**
 * One call under /accounts/<id>/pages/projects/. Returns Cloudflare's whole
 * answer ({ result, result_info }); throws its reason, with `status`, on failure.
 */
export async function cf(api, path, method = "GET") {
  const { accountId, token, fetchImpl = fetch, retryDelayMs = 2000 } = api;
  let res;
  // Hundreds of calls in a row: retry Cloudflare's occasional 5xx.
  for (let attempt = 1; ; attempt += 1) {
    res = await fetchImpl(`${API}/accounts/${accountId}/pages/projects/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status < 500 || attempt === 4) break;
    await new Promise((done) => setTimeout(done, retryDelayMs * attempt));
  }
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const why = (data.errors || []).map((error) => error.message).join("; ") || `HTTP ${res.status}`;
    throw Object.assign(new Error(`Cloudflare ${method} ${path}: ${why}`), { status: res.status });
  }
  return data;
}

/** The project: production_branch, domains, canonical_deployment (the live one). */
export async function getProject(api, project) {
  return (await cf(api, project)).result;
}

/**
 * Every deployment of the project, newest first, as Cloudflare lists them.
 * A deploy while paging shifts the pages: one seen twice is listed once.
 */
export async function listDeployments(api, project) {
  const all = new Map();
  // 25 a page is the most this list allows.
  for (let page = 1; ; page += 1) {
    const { result, result_info: info } = await cf(api, `${project}/deployments?per_page=25&page=${page}`);
    for (const deployment of result) if (!all.has(deployment.id)) all.set(deployment.id, deployment);
    if (!result.length || page >= (info?.total_pages || 1)) break;
  }
  return [...all.values()];
}

/**
 * Delete one deployment. force: a branch's newest deployment carries its alias
 * (<branch>.<project>.pages.dev), which Cloudflare won't delete otherwise.
 */
export async function deleteDeployment(api, project, id) {
  await cf(api, `${project}/deployments/${id}?force=true`, "DELETE");
}
