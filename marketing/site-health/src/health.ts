import type {
  HealthAlert,
  HealthState,
  MonitoredSite,
  ProbeCheck,
  ProbeResult,
  SiteId,
} from "./types";

export const FAIL_THRESHOLD = 2;
export const REMIND_AFTER_MS = 30 * 60 * 1000;
export const STATE_KEY = "site";

export function stateKeyFor(id: SiteId): string {
  return id === "production" ? STATE_KEY : `site:${id}`;
}

export function emptyHealthState(): HealthState {
  return {
    consecutiveFails: 0,
    lastAlertAt: null,
    down: false,
    healthEndpointSeen: false,
    lastCheckedAt: null,
    lastError: null,
    lastProbe: null,
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
      lastCheckedAt:
        typeof parsed.lastCheckedAt === "number" ? parsed.lastCheckedAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      lastProbe:
        parsed.lastProbe && typeof parsed.lastProbe === "object"
          ? parsed.lastProbe
          : null,
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
        lastCheckedAt: now,
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
    state: {
      consecutiveFails,
      lastAlertAt,
      down,
      healthEndpointSeen: seen,
      lastCheckedAt: now,
      lastError: null,
      lastProbe: null,
    },
    alert,
  };
}

export function lastErrorFromProbe(probe: ProbeResult): string | null {
  const failed = probe.checks.find((check) => !check.ok);
  if (!failed) return null;
  const error =
    failed.error ||
    (failed.status != null ? `HTTP ${failed.status}` : "failed");
  return `${failed.name}: ${error}`;
}

/** Until production has shipped /health, a 404 there is not an outage. */
export function interpretProbe(
  probe: ProbeResult,
  healthEndpointSeen: boolean,
): { ok: boolean; healthEndpointSeen: boolean } {
  const health = probe.checks.find((check) => check.name === "health");
  const home = probe.checks.find((check) => check.name === "home");
  const homeRequired = Boolean(home);
  const homeOk = homeRequired ? Boolean(home?.ok) : true;
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

export function monitoredSites(env: {
  SITE_URL?: string;
  STAGING_SITE_URL?: string;
}): MonitoredSite[] {
  const productionUrl = env.SITE_URL?.trim() || "https://gwenda.co.uk";
  const stagingUrl =
    env.STAGING_SITE_URL?.trim() || "https://gwenda-staging.pages.dev";
  return [
    {
      id: "production",
      url: productionUrl,
      requireHome: true,
      alert: true,
    },
    {
      id: "staging",
      url: stagingUrl,
      requireHome: false,
      alert: false,
    },
  ];
}

export async function probeSite(
  siteUrl: string,
  fetchImpl: typeof fetch = fetch,
  options: { requireHome?: boolean } = {},
): Promise<ProbeResult> {
  const base = siteUrl.replace(/\/$/, "");
  const requireHome = options.requireHome !== false;
  const checks: ProbeCheck[] = [];

  const health = await probeHealth(`${base}/health`, fetchImpl);
  checks.push(health.check);

  if (requireHome) {
    const home = await probeHome(`${base}/`, fetchImpl);
    checks.push(home);
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    env: health.meta?.env ?? null,
    dataset: health.meta?.dataset ?? null,
    commit: health.meta?.commit ?? null,
  };
}

async function probeHealth(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{
  check: ProbeCheck;
  meta: { env: string | null; dataset: string | null; commit: string | null };
}> {
  const emptyMeta = { env: null, dataset: null, commit: null };
  try {
    const res = await fetchImpl(url, { redirect: "follow" });
    if (!res.ok) {
      return {
        check: {
          name: "health",
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}`,
        },
        meta: emptyMeta,
      };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return {
        check: {
          name: "health",
          ok: false,
          status: res.status,
          error: "Health response was not JSON",
        },
        meta: emptyMeta,
      };
    }
    if (!healthPayloadLooksHealthy(data)) {
      return {
        check: {
          name: "health",
          ok: false,
          status: res.status,
          error: "Health payload was not ok",
        },
        meta: emptyMeta,
      };
    }
    const body = data as {
      env?: unknown;
      dataset?: unknown;
      commit?: unknown;
    };
    return {
      check: { name: "health", ok: true, status: res.status },
      meta: {
        env: typeof body.env === "string" ? body.env : null,
        dataset: typeof body.dataset === "string" ? body.dataset : null,
        commit: typeof body.commit === "string" ? body.commit : null,
      },
    };
  } catch (error) {
    return {
      check: {
        name: "health",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      meta: emptyMeta,
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
