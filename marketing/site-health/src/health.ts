import type {
  HealthAlert,
  HealthState,
  ProbeCheck,
  ProbeResult,
} from "./types";

export const FAIL_THRESHOLD = 2;
export const REMIND_AFTER_MS = 30 * 60 * 1000;
export const STATE_KEY = "site";

export function emptyHealthState(): HealthState {
  return {
    consecutiveFails: 0,
    lastAlertAt: null,
    down: false,
    healthEndpointSeen: false,
  };
}

export function parseHealthState(raw: string | null): HealthState {
  if (!raw) return emptyHealthState();
  try {
    const parsed = JSON.parse(raw) as Partial<HealthState>;
    return {
      consecutiveFails:
        typeof parsed.consecutiveFails === "number"
          ? parsed.consecutiveFails
          : 0,
      lastAlertAt:
        typeof parsed.lastAlertAt === "number" ? parsed.lastAlertAt : null,
      down: Boolean(parsed.down),
      healthEndpointSeen: Boolean(parsed.healthEndpointSeen),
    };
  } catch {
    return emptyHealthState();
  }
}

export function nextHealthState(
  state: HealthState,
  now: number,
  probeOk: boolean,
  healthEndpointSeen = state.healthEndpointSeen,
): { state: HealthState; alert: HealthAlert } {
  const seen = Boolean(healthEndpointSeen);
  if (probeOk) {
    const wasDown = state.down;
    return {
      state: {
        ...emptyHealthState(),
        healthEndpointSeen: seen,
      },
      alert: wasDown ? "recovery" : null,
    };
  }

  const consecutiveFails = (state.consecutiveFails || 0) + 1;
  const down = consecutiveFails >= FAIL_THRESHOLD;
  let alert: HealthAlert = null;
  let lastAlertAt = state.lastAlertAt;

  if (down) {
    if (!state.down) {
      alert = "down";
      lastAlertAt = now;
    } else if (!lastAlertAt || now - lastAlertAt >= REMIND_AFTER_MS) {
      alert = "reminder";
      lastAlertAt = now;
    }
  }

  return {
    state: { consecutiveFails, lastAlertAt, down, healthEndpointSeen: seen },
    alert,
  };
}

/** Until production has shipped /health, a 404 there is not an outage. */
export function interpretProbe(
  probe: ProbeResult,
  healthEndpointSeen: boolean,
): { ok: boolean; healthEndpointSeen: boolean } {
  const health = probe.checks.find((check) => check.name === "health");
  const home = probe.checks.find((check) => check.name === "home");
  const homeOk = Boolean(home?.ok);
  if (health?.ok) {
    return { ok: homeOk, healthEndpointSeen: true };
  }
  if (health?.status === 404 && !healthEndpointSeen) {
    return { ok: homeOk, healthEndpointSeen: false };
  }
  return { ok: false, healthEndpointSeen };
}

export function homePageTitleLooksHealthy(html: string): boolean {
  return /<title>\s*Gwenda/i.test(html);
}

export function healthPayloadLooksHealthy(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const body = data as { ok?: unknown; service?: unknown };
  return body.ok === true && body.service === "gwenda";
}

export async function probeSite(
  siteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const base = siteUrl.replace(/\/$/, "");
  const checks: ProbeCheck[] = [];

  const health = await probeHealth(`${base}/health`, fetchImpl);
  checks.push(health);

  const home = await probeHome(`${base}/`, fetchImpl);
  checks.push(home);

  return { ok: checks.every((check) => check.ok), checks };
}

async function probeHealth(
  url: string,
  fetchImpl: typeof fetch,
): Promise<ProbeCheck> {
  try {
    const res = await fetchImpl(url, { redirect: "follow" });
    if (!res.ok) {
      return {
        name: "health",
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return {
        name: "health",
        ok: false,
        status: res.status,
        error: "Health response was not JSON",
      };
    }
    if (!healthPayloadLooksHealthy(data)) {
      return {
        name: "health",
        ok: false,
        status: res.status,
        error: "Health payload was not ok",
      };
    }
    return { name: "health", ok: true, status: res.status };
  } catch (error) {
    return {
      name: "health",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeHome(
  url: string,
  fetchImpl: typeof fetch,
): Promise<ProbeCheck> {
  try {
    const res = await fetchImpl(url, { redirect: "follow" });
    const html = await res.text();
    if (!res.ok || !homePageTitleLooksHealthy(html)) {
      return {
        name: "home",
        ok: false,
        status: res.status,
        error: res.ok
          ? "Homepage missing expected title"
          : `HTTP ${res.status}`,
      };
    }
    return { name: "home", ok: true, status: res.status };
  } catch (error) {
    return {
      name: "home",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
