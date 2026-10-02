import {
  dispatchContentDeploy,
  dispatchLivePromote,
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

const VALID_TARGETS = new Set<DeployTarget>(["preview", "staging", "production"]);

export function extractBearerSecret(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const deploySecret = request.headers.get("X-Deploy-Secret");
  return deploySecret?.trim() || null;
}

/**
 * Whose secret the caller holds: production ops' (everything) or dev ops'
 * (the dev website only), else null.
 */
export function callerEnvironment(request: Request, env: Env): "production" | "dev" | null {
  const secret = extractBearerSecret(request);
  if (!secret) return null;
  if (env.DEPLOY_WEBHOOK_SECRET && secret === env.DEPLOY_WEBHOOK_SECRET) return "production";
  if (env.DEPLOY_WEBHOOK_SECRET_DEV && secret === env.DEPLOY_WEBHOOK_SECRET_DEV) return "dev";
  return null;
}

/** Production ops' secret: needed for anything that touches production. */
export function isAuthorized(request: Request, env: Env): boolean {
  return callerEnvironment(request, env) === "production";
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

/** One web.yml content build at a time: join a running one, else start it. */
async function contentBuild(
  env: Env,
  target: ContentTarget,
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
  const caller = callerEnvironment(request, env);
  if (!caller) {
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
      body: { error: 'Missing or invalid "target". Use "preview".' },
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
  // The dev secret only ever rebuilds the dev website, whatever the body says.
  if (caller === "dev" || isDevRequest(body)) return contentBuild(env, "dev-preview", "deploy");
  // Prod ops from before the preview moved onto drafts still asks for the
  // old staging site. Nothing builds it any more; the preview follows once
  // that release is replaced.
  if (target === "staging") {
    return { status: 202, body: { ok: true, target, phase: "deploy", skipped: "retired" } };
  }
  return contentBuild(env, "preview", "deploy");
}

export async function handlePromote(
  request: Request,
  env: Env,
): Promise<HandlerResult> {
  const caller = callerEnvironment(request, env);
  if (!caller) {
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
  // The dev secret can't reach the live promote at all.
  if (caller === "dev" || isDevRequest(body)) {
    return contentBuild(env, "dev-live", "promote");
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

  const run = await dispatchLivePromote(env);
  return {
    status: 202,
    body: {
      ok: true,
      target: "production",
      phase: "promote",
      kind: body?.kind || "to-production",
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
  if (!callerEnvironment(request, env)) {
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
