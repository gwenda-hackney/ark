import type {
  DeployStatusResponse,
  DeployTarget,
  DeployTriggerResponse,
  PromoteTriggerResponse,
} from "./types";

function authHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

async function readJsonBody<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      text.trim().startsWith("<!")
        ? `Deploy webhook returned ${response.status} (non-JSON). Check the Worker logs.`
        : `Deploy webhook returned ${response.status}: ${text.slice(0, 200)}`,
    );
  }
}

async function postJson<T extends { error?: string }>(
  url: string,
  secret: string,
  body: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: authHeaders(secret),
      body: JSON.stringify(body),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new Error(
      `Could not reach deploy webhook (${reason}). Check SANITY_STUDIO_SITE_DEPLOY_URL and CORS.`,
    );
  }

  const parsed = await readJsonBody<T>(response);
  if (!response.ok) {
    throw new Error(parsed.error ?? `Deploy request failed (${response.status})`);
  }
  return parsed;
}

export async function triggerContentDeploy(
  baseUrl: string,
  secret: string,
  target: DeployTarget,
): Promise<DeployTriggerResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/deploy`;
  return postJson<DeployTriggerResponse>(url, secret, { target });
}

export async function triggerContentPromote(
  baseUrl: string,
  secret: string,
  previewRunId: number,
): Promise<PromoteTriggerResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/promote`;
  return postJson<PromoteTriggerResponse>(url, secret, { previewRunId });
}

export async function fetchDeployStatus(
  baseUrl: string,
  secret: string,
  runId: number,
): Promise<DeployStatusResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/status?run_id=${runId}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new Error(`Could not reach deploy status (${reason}).`);
  }

  const body = await readJsonBody<DeployStatusResponse>(response);
  if (!response.ok) {
    throw new Error(body.error ?? `Status request failed (${response.status})`);
  }
  return body;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PREVIEW_SESSION_KEY = "gwenda.siteDeploy.productionPreview";

export type StoredProductionPreview = {
  previewRunId: number;
  previewUrl: string;
  runUrl: string;
};

export function loadStoredProductionPreview(): StoredProductionPreview | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProductionPreview;
    if (
      typeof parsed.previewRunId !== "number" ||
      typeof parsed.previewUrl !== "string" ||
      typeof parsed.runUrl !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeProductionPreview(preview: StoredProductionPreview): void {
  try {
    sessionStorage.setItem(PREVIEW_SESSION_KEY, JSON.stringify(preview));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function clearStoredProductionPreview(): void {
  try {
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
  } catch {
    // Ignore.
  }
}
