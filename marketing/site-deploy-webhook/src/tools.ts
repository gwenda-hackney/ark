/**
 * Ops Website page helpers: compare the code the preview and live run, and start
 * a Baserow copy (production → dev). Both need the GitHub token only
 * this worker holds.
 */
import { githubFetch } from "./github";
import { isAuthorized } from "./handler";
import type { Env, HandlerResult, WorkflowRun } from "./types";

export const BASEROW_COPY_WORKFLOW_FILE = "baserow-copy.yml";
export const BASEROW_COPY_TARGETS = new Set(["ops-dev", "website-dev"]);

const SHA = /^[0-9a-f]{7,40}$/i;

type CompareCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } };
};

/** GET /compare?base=<live sha>&head=<preview sha> */
export async function handleCompare(request: Request, env: Env): Promise<HandlerResult> {
  if (!isAuthorized(request, env)) return { status: 401, body: { error: "Unauthorized" } };
  const url = new URL(request.url);
  const base = url.searchParams.get("base") || "";
  const head = url.searchParams.get("head") || "";
  if (!SHA.test(base) || !SHA.test(head)) {
    return { status: 400, body: { error: "base and head must be commit SHAs." } };
  }
  const res = await githubFetch(env, `/compare/${base}...${head}`);
  if (!res.ok) {
    return {
      status: res.status === 404 ? 404 : 502,
      body: { error: `GitHub compare failed (${res.status}).` },
    };
  }
  const data = (await res.json()) as {
    status: string;
    ahead_by: number;
    behind_by: number;
    html_url: string;
    commits?: CompareCommit[];
    files?: { filename: string }[];
  };
  const commits = (data.commits || [])
    .slice(-50)
    .reverse()
    .map((commit) => ({
      sha: commit.sha,
      url: commit.html_url,
      message: String(commit.commit.message || "").split("\n")[0],
      author: commit.commit.author?.name || "",
      date: commit.commit.author?.date || "",
    }));
  return {
    status: 200,
    body: {
      ok: true,
      status: data.status,
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      url: data.html_url,
      files: (data.files || []).length,
      commits,
    },
  };
}

async function latestCopyRun(env: Env, after: number): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${BASEROW_COPY_WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=5`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { workflow_runs?: (WorkflowRun & { created_at?: string })[] };
  return (
    (data.workflow_runs || []).find(
      (run) => !run.created_at || Date.parse(run.created_at) >= after - 5000,
    ) ?? null
  );
}

/** POST /baserow-copy { target: "ops-dev" | "website-dev" } */
export async function handleBaserowCopy(request: Request, env: Env): Promise<HandlerResult> {
  if (!isAuthorized(request, env)) return { status: 401, body: { error: "Unauthorized" } };
  let body: { target?: string } | null = null;
  try {
    body = (await request.json()) as { target?: string };
  } catch {
    body = null;
  }
  const target = String(body?.target || "");
  if (!BASEROW_COPY_TARGETS.has(target)) {
    return { status: 400, body: { error: 'target must be "ops-dev" or "website-dev".' } };
  }
  const started = Date.now();
  const res = await githubFetch(env, `/actions/workflows/${BASEROW_COPY_WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { target } }),
  });
  if (res.status !== 204) {
    return {
      status: 502,
      body: { error: `GitHub dispatch failed (${res.status}): ${await res.text()}` },
    };
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const run = await latestCopyRun(env, started);
    if (run) {
      return {
        status: 202,
        body: { ok: true, target, runId: run.id, runUrl: run.html_url, status: run.status },
      };
    }
  }
  return { status: 202, body: { ok: true, target, runId: null, status: "queued" } };
}
