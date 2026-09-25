import {
  dispatchContentDeploy,
  dispatchStagingPromote,
  findInProgressPromoteRun,
  findInProgressRun,
  getRunStatus,
  isProductionContentPreviewRun,
  isProductionContentPromoteRun,
  PRODUCTION_CONTENT_PREVIEW_URL,
} from "./github";
import type {
  ContentTarget,
  DeployRequest,
  DeployTarget,
  Env,
  HandlerResult,
  PromoteRequest,
} from "./types";

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

/** Dev ops asks for the dev website; anything else is prod. */
export function isDevRequest(body: { env?: unknown } | null): boolean {
  return body?.env === "dev";
}

/** Build the dev website (gwenda-web-dev) from main, once at a time. */
async function devContentBuild(
  env: Env,
  target: Extract<ContentTarget, "dev-staging" | "dev-production">,
  phase: "deploy" | "promote",
): Promise<HandlerResult> {
  const inProgress = await findInProgressRun(env, target);
  const run = inProgress ?? (await dispatchContentDeploy(env, target));
  return {
    status: 202,
    body: {
      ok: true,
      target,
      phase,
      ...(inProgress ? { alreadyRunning: true } : {}),
      runId: run.id,
      runUrl: run.html_url,
      status: run.status,
    },
  };
}

export function parsePreviewRunId(body: PromoteRequest | null): number | null {
  const raw = body?.previewRunId;
  const runId = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(runId) || runId <= 0) return null;
  return runId;
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
  if (target === "staging" && isDevRequest(body)) {
    return devContentBuild(env, "dev-staging", "deploy");
  }
  if (!target) {
    return {
      status: 400,
      body: { error: 'Missing or invalid "target". Use "staging".' },
    };
  }
  if (target === "production") {
    return {
      status: 400,
      body: {
        error:
          "Production is published from ops Website > Release, which calls POST /promote.",
      },
    };
  }

  const inProgress = await findInProgressRun(env, target);
  if (inProgress) {
    return {
      status: 202,
      body: {
        ok: true,
        target,
        phase: "deploy",
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
      phase: "deploy",
      runId: run.id,
      runUrl: run.html_url,
      status: run.status,
    },
  };
}

export function parsePromoteKind(body: PromoteRequest | null): string {
  const kind = body?.kind;
  if (kind === "development-to-staging") return kind;
  return "staging-to-production";
}

export async function handlePromote(
  request: Request,
  env: Env,
): Promise<HandlerResult> {
  if (!isAuthorized(request, env)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (!env.GITHUB_TOKEN) {
    return { status: 500, body: { error: "GITHUB_TOKEN is not configured" } };
  }

  let body: PromoteRequest | null = null;
  try {
    body = (await request.json()) as PromoteRequest;
  } catch {
    body = null;
  }

  // Dev ops "Update website now": rebuild the dev website, never gwenda.co.uk.
  if (isDevRequest(body)) {
    return devContentBuild(env, "dev-production", "promote");
  }

  const kind = parsePromoteKind(body);
  const toStaging = kind === "development-to-staging";

  if (toStaging) {
    const inProgressStaging = await findInProgressRun(env, "staging");
    if (inProgressStaging) {
      return {
        status: 202,
        body: {
          ok: true,
          target: "staging",
          phase: "deploy",
          kind,
          alreadyRunning: true,
          runId: inProgressStaging.id,
          runUrl: inProgressStaging.html_url,
          status: inProgressStaging.status,
        },
      };
    }
    const run = await dispatchContentDeploy(env, "staging");
    return {
      status: 202,
      body: {
        ok: true,
        target: "staging",
        phase: "deploy",
        kind: "staging-content",
        runId: run.id,
        runUrl: run.html_url,
        status: run.status,
      },
    };
  }

  const inProgress = await findInProgressPromoteRun(env);
  if (inProgress) {
    return {
      status: 202,
      body: {
        ok: true,
        target: "production",
        phase: "promote",
        alreadyRunning: true,
        runId: inProgress.id,
        runUrl: inProgress.html_url,
        status: inProgress.status,
      },
    };
  }

  const run = await dispatchStagingPromote(env);
  return {
    status: 202,
    body: {
      ok: true,
      target: "production",
      phase: "promote",
      kind: body?.kind || "staging-to-production",
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
  const completed = run.status === "completed";
  const isPreview = isProductionContentPreviewRun(run);
  const isPromote = isProductionContentPromoteRun(run);
  const previewReady =
    completed && run.conclusion === "success" && isPreview;

  return {
    status: 200,
    body: {
      ok: true,
      runId: run.id,
      runUrl: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
      completed,
      phase: isPreview ? "preview" : isPromote ? "promote" : "deploy",
      ...(previewReady
        ? {
            previewUrl: PRODUCTION_CONTENT_PREVIEW_URL,
            previewRunId: run.id,
          }
        : {}),
    },
  };
}
