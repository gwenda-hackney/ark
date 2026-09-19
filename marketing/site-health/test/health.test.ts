import { describe, expect, it, vi } from "vitest";
import { formatHealthAlertEmail } from "../src/alert";
import {
  emptyHealthState,
  FAIL_THRESHOLD,
  healthPayloadLooksHealthy,
  homePageTitleLooksHealthy,
  interpretProbe,
  nextHealthState,
  parseHealthState,
  probeSite,
  REMIND_AFTER_MS,
} from "../src/health";
import { runHealthCheck } from "../src/index";
import type { Env, ProbeResult } from "../src/types";

describe("nextHealthState", () => {
  const now = 1_000_000;

  it("alerts after two consecutive failures", () => {
    const first = nextHealthState(emptyHealthState(), now, false);
    expect(first.alert).toBeNull();
    expect(first.state.consecutiveFails).toBe(1);
    expect(first.state.down).toBe(false);

    const second = nextHealthState(first.state, now + 60_000, false);
    expect(second.alert).toBe("down");
    expect(second.state.consecutiveFails).toBe(FAIL_THRESHOLD);
    expect(second.state.down).toBe(true);
  });

  it("reminds at most every 30 minutes while down", () => {
    const down = nextHealthState(
      {
        consecutiveFails: 2,
        lastAlertAt: now,
        down: true,
        healthEndpointSeen: true,
      },
      now + 5 * 60_000,
      false,
    );
    expect(down.alert).toBeNull();

    const reminder = nextHealthState(down.state, now + REMIND_AFTER_MS, false);
    expect(reminder.alert).toBe("reminder");
  });

  it("sends recovery once when the site returns", () => {
    const recovered = nextHealthState(
      {
        consecutiveFails: 4,
        lastAlertAt: now,
        down: true,
        healthEndpointSeen: true,
      },
      now + 60_000,
      true,
    );
    expect(recovered.alert).toBe("recovery");
    expect(recovered.state).toEqual({
      ...emptyHealthState(),
      healthEndpointSeen: true,
    });
  });

  it("does not recover-alert if it was never down", () => {
    const result = nextHealthState(
      {
        consecutiveFails: 1,
        lastAlertAt: null,
        down: false,
        healthEndpointSeen: false,
      },
      now,
      true,
    );
    expect(result.alert).toBeNull();
  });
});

describe("parseHealthState", () => {
  it("returns empty state for missing or invalid JSON", () => {
    expect(parseHealthState(null)).toEqual(emptyHealthState());
    expect(parseHealthState("not-json")).toEqual(emptyHealthState());
  });
});

describe("probes", () => {
  it("accepts a healthy homepage title and health JSON", () => {
    expect(
      homePageTitleLooksHealthy("<title>Gwenda | Hackney Wick</title>"),
    ).toBe(true);
    expect(healthPayloadLooksHealthy({ ok: true, service: "gwenda" })).toBe(
      true,
    );
    expect(healthPayloadLooksHealthy({ ok: true, service: "other" })).toBe(
      false,
    );
  });

  it("fails when /health is not ok", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith("/health")) {
        return new Response(JSON.stringify({ ok: false }), { status: 500 });
      }
      return new Response("<title>Gwenda</title>", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await probeSite("https://gwenda.co.uk", fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "health")?.ok).toBe(false);
  });
});

describe("interpretProbe", () => {
  it("ignores /health 404 until the endpoint has succeeded once", () => {
    const probe: ProbeResult = {
      ok: false,
      checks: [
        { name: "health", ok: false, status: 404, error: "HTTP 404" },
        { name: "home", ok: true, status: 200 },
      ],
    };
    expect(interpretProbe(probe, false)).toEqual({
      ok: true,
      healthEndpointSeen: false,
    });
    expect(interpretProbe(probe, true)).toEqual({
      ok: false,
      healthEndpointSeen: true,
    });
  });

  it("requires /health after it has been seen", () => {
    const probe: ProbeResult = {
      ok: true,
      checks: [
        { name: "health", ok: true, status: 200 },
        { name: "home", ok: true, status: 200 },
      ],
    };
    expect(interpretProbe(probe, false)).toEqual({
      ok: true,
      healthEndpointSeen: true,
    });
  });
});

describe("formatHealthAlertEmail", () => {
  it("describes a down probe without em dashes", () => {
    const probe: ProbeResult = {
      ok: false,
      checks: [
        {
          name: "health",
          ok: false,
          status: 502,
          error: "Health payload was not ok",
        },
      ],
    };
    const mail = formatHealthAlertEmail("down", probe, "https://gwenda.co.uk");
    expect(mail.subject).toBe("Gwenda site down");
    expect(mail.text).toContain(
      "https://gwenda.co.uk failed the health probe.",
    );
    expect(mail.text).toContain("- health: fail status=502");
    expect(mail.text).not.toContain("—");
  });
});

describe("runHealthCheck", () => {
  function memoryKv(initial: Record<string, string> = {}) {
    const store = { ...initial };
    return {
      get: async (key: string) => store[key] ?? null,
      put: async (key: string, value: string) => {
        store[key] = value;
      },
      store,
    };
  }

  const env = {
    SITE_URL: "https://gwenda.co.uk",
    ALERT_EMAIL: "alerts@gwenda.co.uk",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "587",
    SMTP_USER: "notifications@gwenda.co.uk",
    SMTP_PASSWORD: "secret",
  } as Env;

  it("emails after two failed runs and once on recovery", async () => {
    const kv = memoryKv();
    const alerts: string[] = [];
    const sendAlert = vi.fn(async (_env: Env, alert: string) => {
      alerts.push(alert);
      return { ok: true };
    });
    const failing: ProbeResult = {
      ok: false,
      checks: [{ name: "health", ok: false, status: 502 }],
    };
    const ok: ProbeResult = {
      ok: true,
      checks: [
        { name: "health", ok: true, status: 200 },
        { name: "home", ok: true, status: 200 },
      ],
    };

    const bound = { ...env, HEALTH_STATE: kv as unknown as KVNamespace };

    await runHealthCheck(bound, {
      probe: async () => failing,
      sendAlert,
      now: 1_000,
    });
    expect(sendAlert).not.toHaveBeenCalled();

    await runHealthCheck(bound, {
      probe: async () => failing,
      sendAlert,
      now: 2_000,
    });
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(alerts[0]).toBe("down");

    await runHealthCheck(bound, {
      probe: async () => ok,
      sendAlert,
      now: 3_000,
    });
    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(alerts[1]).toBe("recovery");
  });
});
