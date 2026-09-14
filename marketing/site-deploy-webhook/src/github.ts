import type { DeployTarget, Env, WorkflowRun } from "./types";

const WORKFLOW_FILES: Record<DeployTarget, string> = {
  staging: "deploy-staging-content.yml",
  production: "deploy-production-content.yml",
};

const PROMOTE_WORKFLOW_FILE = "deploy-production-content-promote.yml";

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

export function workflowFileForTarget(target: DeployTarget): string {
  return WORKFLOW_FILES[target];
}

export function refForTarget(target: DeployTarget): string {
  return WORKFLOW_REFS[target];
}

export function isProductionContentPreviewRun(run: WorkflowRun): boolean {
  const path = run.path ?? "";
  return (
    path.endsWith("deploy-production-content.yml") ||
    path.includes("/deploy-production-content.yml")
  );
}

export function isProductionContentPromoteRun(run: WorkflowRun): boolean {
  const path = run.path ?? "";
  return (
    path.endsWith("deploy-production-content-promote.yml") ||
    path.includes("/deploy-production-content-promote.yml")
  );
}

export async function findInProgressRun(
  env: Env,
  target: DeployTarget,
): Promise<WorkflowRun | null> {
  const workflowFile = workflowFileForTarget(target);
  const res = await githubFetch(
    env,
    `/actions/workflows/${workflowFile}/runs?status=in_progress&per_page=1`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return data.workflow_runs?.[0] ?? null;
}

export async function findInProgressPromoteRun(
  env: Env,
): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${PROMOTE_WORKFLOW_FILE}/runs?status=in_progress&per_page=1`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return data.workflow_runs?.[0] ?? null;
}

export async function dispatchContentDeploy(
  env: Env,
  target: DeployTarget,
): Promise<WorkflowRun> {
  const workflowFile = workflowFileForTarget(target);
  const ref = refForTarget(target);

  const res = await githubFetch(env, `/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
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
        inputs: { preview_run_id: String(previewRunId) },
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
  const workflowFile = workflowFileForTarget(target);
  const res = await githubFetch(
    env,
    `/actions/workflows/${workflowFile}/runs?per_page=1`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return data.workflow_runs?.[0] ?? null;
}

async function getLatestPromoteRun(env: Env): Promise<WorkflowRun | null> {
  const res = await githubFetch(
    env,
    `/actions/workflows/${PROMOTE_WORKFLOW_FILE}/runs?per_page=1`,
  );

  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { workflow_runs?: WorkflowRun[] };
  return data.workflow_runs?.[0] ?? null;
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
