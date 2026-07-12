import {
  dispatchContentDeploy,
  findInProgressRun,
  getRunStatus,
} from "./github";
import type { DeployRequest, DeployTarget, Env, HandlerResult } from "./types";

const VALID_TARGETS = new Set<DeployTarget>(["staging", "production"]);

export function extractBearerSecret(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const deploySecret = request.headers.get("X-Deploy-Secret");
  return deploySecret?.trim() || null;
}

export function isAuthorized(request: Request, env: Env): boolean {
  const secret = extractBearerSecret(request);
  return Boolean(secret && env.DEPLOY_WEBHOOK_SECRET && secret === env.DEPLOY_WEBHOOK_SECRET);
}

export function parseDeployTarget(body: DeployRequest | null): DeployTarget | null {
  const target = body?.target;
  if (typeof target !== "string") return null;
  return VALID_TARGETS.has(target as DeployTarget) ? (target as DeployTarget) : null;
}

export async function handleDeploy(
  request: Request,
  env: Env,
): Promise<HandlerResult> {
  if (!isAuthorized(request, env)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!env.GITHUB_TOKEN) {
    return { status: 500, body: { error: "GITHUB_TOKEN is not configured" } };
  }

  let body: DeployRequest | null = null;
  try {
    body = (await request.json()) as DeployRequest;
  } catch {
    body = null;
  }

  const target = parseDeployTarget(body);
  if (!target) {
    return {
      status: 400,
      body: { error: 'Missing or invalid "target" — use "staging" or "production"' },
    };
  }

  const inProgress = await findInProgressRun(env, target);
  if (inProgress) {
    return {
      status: 202,
      body: {
        ok: true,
        target,
        alreadyRunning: true,
        runId: inProgress.id,
        runUrl: inProgress.html_url,
        status: inProgress.status,
      },
    };
  }

  const run = await dispatchContentDeploy(env, target);
  return {
    status: 202,
    body: {
      ok: true,
      target,
      runId: run.id,
      runUrl: run.html_url,
      status: run.status,
    },
  };
}

export async function handleStatus(
  request: Request,
  env: Env,
): Promise<HandlerResult> {
  if (!isAuthorized(request, env)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const runIdRaw = new URL(request.url).searchParams.get("run_id");
  const runId = runIdRaw ? Number(runIdRaw) : NaN;
  if (!Number.isFinite(runId) || runId <= 0) {
    return { status: 400, body: { error: "Missing or invalid run_id query parameter" } };
  }

  const run = await getRunStatus(env, runId);
  return {
    status: 200,
    body: {
      ok: true,
      runId: run.id,
      runUrl: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
      completed: run.status === "completed",
    },
  };
}
