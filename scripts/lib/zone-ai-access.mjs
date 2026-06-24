/** @typedef {{ get: (path: string, opts?: object) => Promise<unknown>, put: (path: string, body: object) => Promise<unknown> }} CfClient */

export const TOKEN_PERMISSION_HINT = `CI token is missing Cloudflare permission App Security → Bot Management (Edit) on gwenda.co.uk.
Edit the token at https://dash.cloudflare.com/profile/api-tokens → your CI token → Configure:
  Permissions → Add permission → App Security | Bot Management | Edit
  Zone Resources → Include → Specific zone → gwenda.co.uk
Then update the CLOUDFLARE_API_TOKEN GitHub secret.
Or disable manually: zone gwenda.co.uk → Security → Settings → filter "Bot traffic" →
  Block AI bots = "Do not block (off)" AND Instruct AI bot traffic with robots.txt = OFF.`;

export const DESIRED_BOT_MANAGEMENT = {
  ai_bots_protection: "disabled",
  crawler_protection: "disabled",
  is_robots_txt_managed: false,
  cf_robots_variant: "off",
};

const MANAGED_ROBOTS_MARKER = "# BEGIN Cloudflare Managed content";
const BLOCKED_AI_AGENTS = ["Google-Extended", "GPTBot", "ClaudeBot"];

/**
 * @param {string} robotsTxt
 */
export function assertRobotsTxtAllowsAi(robotsTxt) {
  if (robotsTxt.includes(MANAGED_ROBOTS_MARKER)) {
    throw new Error(
      `robots.txt still contains Cloudflare managed AI blocks (${MANAGED_ROBOTS_MARKER}).`,
    );
  }

  for (const agent of BLOCKED_AI_AGENTS) {
    const block = new RegExp(
      `User-agent:\\s*${agent}[\\s\\S]*?Disallow:\\s*/`,
      "i",
    );
    if (block.test(robotsTxt)) {
      throw new Error(`robots.txt still blocks ${agent}.`);
    }
  }
}

/**
 * @param {Record<string, unknown>} config
 */
export function assertBotManagementAllowsAi(config) {
  for (const [key, expected] of Object.entries(DESIRED_BOT_MANAGEMENT)) {
    if (config[key] !== expected) {
      throw new Error(
        `bot_management.${key} is ${JSON.stringify(config[key])}, expected ${JSON.stringify(expected)}.`,
      );
    }
  }
}

/**
 * @param {Response} res
 */
async function parseCfResponse(res) {
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.errors?.[0]?.code;
    throw err;
  }
  return data.result;
}

/**
 * @param {{ accountId: string, apiToken: string, fetchImpl?: typeof fetch }} opts
 * @returns {CfClient}
 */
export function createCfClient({ accountId, apiToken, fetchImpl = fetch }) {
  async function request(path, { method = "GET", body } = {}) {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return parseCfResponse(res);
  }

  return {
    get: (path) => request(path),
    put: (path, body) => request(path, { method: "PUT", body }),
    async findZone(zoneName) {
      const zones = await request(
        `/zones?name=${encodeURIComponent(zoneName)}&account.id=${accountId}`,
      );
      return zones?.[0] ?? null;
    },
  };
}

/**
 * @param {CfClient} cf
 * @param {string} zoneId
 */
export async function readBotManagement(cf, zoneId) {
  return (await cf.get(`/zones/${zoneId}/bot_management`)) ?? {};
}

/**
 * @param {CfClient} cf
 * @param {string} zoneId
 * @param {Record<string, unknown>} current
 */
export async function writeBotManagement(cf, zoneId) {
  return cf.put(`/zones/${zoneId}/bot_management`, {
    ...DESIRED_BOT_MANAGEMENT,
  });
}

/**
 * @param {string} origin e.g. https://gwenda.co.uk
 * @param {{ fetchImpl?: typeof fetch, attempts?: number, delayMs?: number }} [opts]
 */
export async function verifyLiveRobotsTxt(origin, opts = {}) {
  const { fetchImpl = fetch, attempts = 6, delayMs = 5000 } = opts;
  const url = `${origin.replace(/\/$/, "")}/robots.txt`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        throw new Error(`${url} returned ${res.status}`);
      }
      assertRobotsTxtAllowsAi(await res.text());
      return;
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * @param {CfClient} cf
 * @param {string} zoneName
 * @param {{ verifyOrigin?: string, fetchImpl?: typeof fetch }} [opts]
 */
export async function ensureZoneAiAccess(cf, zoneName, opts = {}) {
  const zone = await cf.findZone(zoneName);
  if (!zone) {
    throw new Error(
      `Zone ${zoneName} was not found on account. ${TOKEN_PERMISSION_HINT}`,
    );
  }

  try {
    await readBotManagement(cf, zone.id);
  } catch (err) {
    throw new Error(
      `Could not read bot_management for ${zoneName}: ${err.message}. ${TOKEN_PERMISSION_HINT}`,
      { cause: err },
    );
  }

  await writeBotManagement(cf, zone.id);

  const updated = await readBotManagement(cf, zone.id);
  assertBotManagementAllowsAi(updated);

  if (opts.verifyOrigin) {
    await verifyLiveRobotsTxt(opts.verifyOrigin, {
      fetchImpl: opts.fetchImpl,
    });
  }

  return { zoneId: zone.id, config: updated };
}
