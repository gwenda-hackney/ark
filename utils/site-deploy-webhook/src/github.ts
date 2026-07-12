import type { DeployTarget, Env, WorkflowRun } from "./types";

const WORKFLOW_FILES: Record<DeployTarget, string> = {
  staging: "deploy-staging-content.yml",
  production: "deploy-production-content.yml",
};

const WORKFLOW_REFS: Record<DeployTarget, string> = {
  staging: "main",
  production: "release",
};

type GitHubRequestInit = RequestInit;

async function githubFetch(
  env: Env,
  path: string,
  init: GitHubRequestInit = {},
): Promise<Response> {
  const url = path.startsWith("https://")
    ? path
    : `https://api.github.com/repos/${env.GITHUB_REPOSITORY}${path}`;

  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
}

export function workflowFileForTarget(target: DeployTarget): string {
  return WORKFLOW_FILES[target];
}

export function refForTarget(target: DeployTarget): string {
  return WORKFLOW_REFS[target];
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
