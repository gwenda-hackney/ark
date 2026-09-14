import type { DeployTarget, Env, WorkflowRun } from "./types";

const WEB_WORKFLOW_FILE = "web.yml";
const PROMOTE_WORKFLOW_FILE = "web-promote.yml";

const CONTENT_ACTION: Record<DeployTarget, string> = {
  staging: "staging-content",
  production: "production-content",
};

/** Also accept legacy repository_dispatch action names in run-name. */
const CONTENT_RUN_NAMES: Record<DeployTarget, string[]> = {
  staging: ["staging-content", "content-deploy-staging"],
  production: ["production-content", "content-deploy-production"],
};

const WORKFLOW_REFS: Record<DeployTarget, string> = {
  staging: "main",
  // Workflow definition from main; jobs still checkout `release` for site code.
  production: "main",
};

/** Stable Pages alias for production content (and code) previews. */
export const PRODUCTION_CONTENT_PREVIEW_URL =
  "https://release-preview.gwenda-blue.pages.dev";

type GitHubRequestInit = RequestInit;

async function githubFetch(
  env: Env,
  path: string,
  init: GitHubRequestInit = {},
): Promise<Response> {
  const url = path.startsWith("https://")
    ? path
    : `https://api.github.com/repos/${env.GITHUB_REPOSITORY}${path}`;

  // Use Headers so User-Agent is definitely applied. Cloudflare Workers do not
  // send a default User-Agent; GitHub returns 403 without one.
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.GITHUB_TOKEN}`);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "gwenda-site-deploy-webhook");

  return fetch(url, {
    ...init,
    headers,
  });
}

export function workflowFileForTarget(_target: DeployTarget): string {
  return WEB_WORKFLOW_FILE;
}

export function refForTarget(target: DeployTarget): string {
  return WORKFLOW_REFS[target];
}

export function contentActionForTarget(target: DeployTarget): string {
  return CONTENT_ACTION[target];
}

function runName(run: WorkflowRun): string {
  return String(run.display_title || run.name || "").trim();
}

export function isContentRunForTarget(run: WorkflowRun, target: DeployTarget): boolean {
  const path = run.path ?? "";
  if (!path.endsWith(WEB_WORKFLOW_FILE) && !path.includes(`/${WEB_WORKFLOW_FILE}`)) {
    return false;
  }
  const name = runName(run);
  return CONTENT_RUN_NAMES[target].some(
    (expected) => name === expected || name.includes(expected),
  );
}

export function isProductionContentPreviewRun(run: WorkflowRun): boolean {
  return isContentRunForTarget(run, "production");
}

export function isProductionContentPromoteRun(run: WorkflowRun): boolean {
  const path = run.path ?? "";
  if (
    !path.endsWith(PROMOTE_WORKFLOW_FILE) &&
    !path.includes(`/${PROMOTE_WORKFLOW_FILE}`)
  ) {
    return false;
  }
  const name = runName(run);
  return name === "promote-content" || name.includes("promote-content");
}

function pickMatchingRun(
  runs: WorkflowRun[] | undefined,
  target: DeployTarget,
): WorkflowRun | null {
  if (!runs?.length) return null;
  return runs.find((run) => isContentRunForTarget(run, target)) ?? null;
}

export async function findInProgressRun(
  env: Env,
  target: DeployTarget,
): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${WEB_WORKFLOW_FILE}/runs?status=in_progress&per_page=10`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return pickMatchingRun(data.workflow_runs, target);
}

export async function findInProgressPromoteRun(
  env: Env,
): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${PROMOTE_WORKFLOW_FILE}/runs?status=in_progress&per_page=10`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  const runs = data.workflow_runs ?? [];
  return (
    runs.find((run) => isProductionContentPromoteRun(run)) ?? runs[0] ?? null
  );
}

export async function dispatchContentDeploy(
  env: Env,
  target: DeployTarget,
): Promise<WorkflowRun> {
  const ref = refForTarget(target);
  const action = contentActionForTarget(target);

  const res = await githubFetch(env, `/actions/workflows/${WEB_WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref,
      inputs: { action },
    }),
  });

  if (res.status !== 204) {
    throw new Error(`GitHub dispatch failed ${res.status}: ${await res.text()}`);
  }

  // Dispatch is async — poll briefly for the new run.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const run = await findInProgressRun(env, target);
    if (run) return run;
  }

  const latest = await getLatestRun(env, target);
  if (!latest) {
    throw new Error("Deploy dispatched but workflow run could not be resolved");
  }
  return latest;
}

export async function dispatchContentPromote(
  env: Env,
  previewRunId: number,
): Promise<WorkflowRun> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${PROMOTE_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          kind: "content",
          preview_run_id: String(previewRunId),
        },
      }),
    },
  );

  if (res.status !== 204) {
    throw new Error(`GitHub promote dispatch failed ${res.status}: ${await res.text()}`);
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const run = await findInProgressPromoteRun(env);
    if (run) return run;
  }

  const latest = await getLatestPromoteRun(env);
  if (!latest) {
    throw new Error("Promote dispatched but workflow run could not be resolved");
  }
  return latest;
}

async function getLatestRun(
  env: Env,
  target: DeployTarget,
): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${WEB_WORKFLOW_FILE}/runs?per_page=10`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return pickMatchingRun(data.workflow_runs, target);
}

async function getLatestPromoteRun(env: Env): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${PROMOTE_WORKFLOW_FILE}/runs?per_page=10`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  const runs = data.workflow_runs ?? [];
  return (
    runs.find((run) => isProductionContentPromoteRun(run)) ?? runs[0] ?? null
  );
}

export async function getRunStatus(
  env: Env,
  runId: number,
): Promise<WorkflowRun> {
  const res = await githubFetch(env, `/actions/runs/${runId}`);

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as WorkflowRun;
}
