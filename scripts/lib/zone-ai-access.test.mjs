import { describe, expect, it, vi } from "vitest";
import {
  assertBotManagementAllowsAi,
  assertRobotsTxtAllowsAi,
  createCfClient,
  ensureZoneAiAccess,
} from "./zone-ai-access.mjs";

const BLOCKED_ROBOTS = `# BEGIN Cloudflare Managed content
User-agent: Google-Extended
Disallow: /`;

const OPEN_ROBOTS = `User-agent: *
Content-Signal: search=yes,ai-input=yes,ai-train=yes
Allow: /`;

describe("assertRobotsTxtAllowsAi", () => {
  it("rejects Cloudflare managed AI blocks", () => {
    expect(() => assertRobotsTxtAllowsAi(BLOCKED_ROBOTS)).toThrow(
      /Cloudflare managed AI blocks/,
    );
  });

  it("accepts an open robots.txt", () => {
    expect(() => assertRobotsTxtAllowsAi(OPEN_ROBOTS)).not.toThrow();
  });
});

describe("assertBotManagementAllowsAi", () => {
  it("rejects active AI bot blocking", () => {
    expect(() =>
      assertBotManagementAllowsAi({
        ai_bots_protection: "block",
        crawler_protection: "disabled",
        is_robots_txt_managed: false,
        cf_robots_variant: "off",
      }),
    ).toThrow(/ai_bots_protection/);
  });
});

describe("ensureZoneAiAccess", () => {
  it("fails when bot_management returns authentication error (CI repro)", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("/zones?name=")) {
        return Response.json({
          success: true,
          result: [{ id: "zone123", name: "gwenda.co.uk" }],
        });
      }
      if (String(url).includes("/bot_management")) {
        return Response.json(
          {
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
          },
          { status: 403 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const cf = createCfClient({
      accountId: "acct",
      apiToken: "token",
      fetchImpl,
    });

    await expect(ensureZoneAiAccess(cf, "gwenda.co.uk")).rejects.toThrow(
      /Authentication error/,
    );
    await expect(ensureZoneAiAccess(cf, "gwenda.co.uk")).rejects.toThrow(
      /Bot Management/,
    );
  });

  it("updates bot_management and verifies live robots.txt", async () => {
    let botConfig = {
      ai_bots_protection: "block",
      crawler_protection: "enabled",
      is_robots_txt_managed: true,
      cf_robots_variant: "policy_only",
      fight_mode: true,
    };

    const fetchImpl = vi.fn(async (url, init) => {
      const target = String(url);
      if (target.includes("/zones?name=")) {
        return Response.json({
          success: true,
          result: [{ id: "zone123", name: "gwenda.co.uk" }],
        });
      }
      if (target.includes("/bot_management") && init?.method === "PUT") {
        botConfig = { ...botConfig, ...JSON.parse(init.body) };
        return Response.json({ success: true, result: botConfig });
      }
      if (target.includes("/bot_management")) {
        return Response.json({ success: true, result: botConfig });
      }
      if (target.endsWith("/robots.txt")) {
        return new Response(OPEN_ROBOTS, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const cf = createCfClient({
      accountId: "acct",
      apiToken: "token",
      fetchImpl,
    });

    const result = await ensureZoneAiAccess(cf, "gwenda.co.uk", {
      verifyOrigin: "https://gwenda.co.uk",
      fetchImpl,
    });

    expect(result.config.ai_bots_protection).toBe("disabled");
    expect(result.config.is_robots_txt_managed).toBe(false);
  });
});
