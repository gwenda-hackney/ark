import type {
  DeployStatusResponse,
  DeployTarget,
  DeployTriggerResponse,
} from "./types";

function authHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

export async function triggerContentDeploy(
  baseUrl: string,
  secret: string,
  target: DeployTarget,
): Promise<DeployTriggerResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/deploy`;
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(secret),
    body: JSON.stringify({ target }),
  });

  const body = (await response.json()) as DeployTriggerResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Deploy request failed (${response.status})`);
  }
  return body;
}

export async function fetchDeployStatus(
  baseUrl: string,
  secret: string,
  runId: number,
): Promise<DeployStatusResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/status?run_id=${runId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = (await response.json()) as DeployStatusResponse;
  if (!response.ok) {
    throw new Error(body.error ?? `Status request failed (${response.status})`);
  }
  return body;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
