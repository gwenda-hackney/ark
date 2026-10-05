/**
 * Ops Website page helpers: compare the code the preview and live run, and start
 * a copy of production over dev (content and databases). Both need the GitHub
 * token only this worker holds.
 */
import { githubFetch } from "./github";
import { callerEnvironment, isAuthorized } from "./handler";
import type { Env, HandlerResult, WorkflowRun } from "./types";

export const DEV_COPY_WORKFLOW_FILE = "copy-prod-to-dev.yml";
export const DEV_COPY_TARGETS = new Set(["everything", "content", "ops-data", "website-data"]);
/** Targets ops sent before the copy took content too (POST /baserow-copy). */
const LEGACY_TARGETS: Record<string, string> = { "ops-dev": "ops-data", "website-dev": "website-data" };

const SHA = /^[0-9a-f]{7,40}$/i;

type CompareCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } };
};

/** GET /compare?base=<live sha>&head=<preview sha> */
export async function handleCompare(request: Request, env: Env): Promise<HandlerResult> {
  // Read-only, so dev ops may ask too.
  if (!callerEnvironment(request, env)) return { status: 401, body: { error: "Unauthorized" } };
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
    `/actions/workflows/${DEV_COPY_WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=5`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { workflow_runs?: (WorkflowRun & { created_at?: string })[] };
  return (
    (data.workflow_runs || []).find(
      (run) => !run.created_at || Date.parse(run.created_at) >= after - 5000,
    ) ?? null
  );
}

/**
 * POST /dev-copy { target: "everything" | "content" | "ops-data" | "website-data" }
 * (also POST /baserow-copy, which older ops sends "ops-dev" | "website-dev" to).
 */
export async function handleDevCopy(request: Request, env: Env): Promise<HandlerResult> {
  // Reads production, so production ops only.
  const caller = callerEnvironment(request, env);
  if (caller === "dev") {
    return { status: 403, body: { error: "Copy production to dev from production ops (Developer tools)." } };
  }
  if (!caller) return { status: 401, body: { error: "Unauthorized" } };
  let body: { target?: string } | null = null;
  try {
    body = (await request.json()) as { target?: string };
  } catch {
    body = null;
  }
  const raw = String(body?.target || "");
  const target = LEGACY_TARGETS[raw] || raw;
  if (!DEV_COPY_TARGETS.has(target)) {
    return { status: 400, body: { error: `target must be one of: ${[...DEV_COPY_TARGETS].join(", ")}.` } };
  }
  const started = Date.now();
  const res = await githubFetch(env, `/actions/workflows/${DEV_COPY_WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Reads production, so it runs on release in the production environment (#61).
    body: JSON.stringify({ ref: "release", inputs: { target } }),
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
