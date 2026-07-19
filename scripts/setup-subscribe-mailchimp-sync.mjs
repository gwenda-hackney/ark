#!/usr/bin/env node
/**
 * Deploy Baserow → Mailchimp subscribe sync Worker and sync secrets.
 *
 * Needs in repo-root .env:
 *   CLOUDFLARE_API_TOKEN, BASEROW_API_KEY, MAILCHIMP_API_KEY
 * Optional: MAILCHIMP_AUDIENCE_ID, SUBSCRIBE_MAILCHIMP_SYNC_SECRET
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "utils/subscribe-mailchimp-sync");
const ENV_PATH = resolve(ROOT, ".env");

function run(cmd, args, { cwd = ROOT, env = process.env, input, quiet = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${result.status}): ${detail || "no output"}`,
    );
  }
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  return result.stdout ?? "";
}

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readWranglerAccountId() {
  const toml = readFileSync(resolve(WORKER_DIR, "wrangler.toml"), "utf8");
  const match = toml.match(/^account_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("account_id not found in wrangler.toml");
  return match[1];
}

function upsertEnvLines(lines) {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const keys = lines.map((line) => line.split("=")[0]);
  const filtered = existing
    .split("\n")
    .filter((line) => {
      const key = line.split("=")[0]?.trim();
      return !keys.includes(key);
    })
    .join("\n")
    .replace(/\n+$/, "");

  const block = `\n\n# Subscribe → Mailchimp sync (npm run setup:subscribe-mailchimp-sync)\n${lines.join("\n")}\n`;
  writeFileSync(
    ENV_PATH,
    filtered ? `${filtered}${block}` : `${block.trimStart()}\n`,
  );
}

function repoSlug() {
  return run(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { quiet: true },
  ).trim();
}

function setGhSecret(name, value) {
  run("gh", ["secret", "set", name, "--repo", repoSlug()], {
    input: value,
    quiet: true,
  });
  console.log(`Set GitHub secret ${name}.`);
}

async function ensureSignedUpMergeField(mailchimpKey, audienceId) {
  const dc = mailchimpKey.split("-").pop();
  const base = `https://${dc}.api.mailchimp.com/3.0`;
  const auth = `Basic ${Buffer.from(`anystring:${mailchimpKey}`).toString("base64")}`;
  const list = await fetch(
    `${base}/lists/${audienceId}/merge-fields?count=100`,
    { headers: { Authorization: auth } },
  );
  const body = await list.json();
  if (!list.ok) {
    throw new Error(`Mailchimp list merge fields failed: ${JSON.stringify(body)}`);
  }
  const existing = (body.merge_fields || []).find((f) => f.tag === "SIGNEDUP");
  if (existing) {
    console.log("Mailchimp merge field SIGNEDUP already exists.");
    return;
  }
  const create = await fetch(`${base}/lists/${audienceId}/merge-fields`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tag: "SIGNEDUP",
      name: "Signed up",
      type: "date",
      required: false,
      public: false,
    }),
  });
  const created = await create.json().catch(() => ({}));
  if (!create.ok) {
    throw new Error(`Mailchimp create SIGNEDUP failed: ${JSON.stringify(created)}`);
  }
  console.log("Created Mailchimp merge field SIGNEDUP (date).");
}

async function main() {
  loadDotEnv();

  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const baserowKey = process.env.BASEROW_API_KEY?.trim();
  const mailchimpKey = process.env.MAILCHIMP_API_KEY?.trim();
  const audienceId =
    process.env.MAILCHIMP_AUDIENCE_ID?.trim() || "e2c69d5d31";
  if (!cloudflareToken) throw new Error("CLOUDFLARE_API_TOKEN is missing from .env");
  if (!baserowKey) throw new Error("BASEROW_API_KEY is missing from .env");
  if (!mailchimpKey) throw new Error("MAILCHIMP_API_KEY is missing from .env");

  await ensureSignedUpMergeField(mailchimpKey, audienceId);

  let syncSecret = process.env.SUBSCRIBE_MAILCHIMP_SYNC_SECRET?.trim();
  if (!syncSecret) {
    syncSecret = randomBytes(32).toString("hex");
    console.log("Generated SUBSCRIBE_MAILCHIMP_SYNC_SECRET.");
  } else {
    console.log("Reusing SUBSCRIBE_MAILCHIMP_SYNC_SECRET from .env.");
  }

  const accountId = readWranglerAccountId();
  const wranglerEnv = {
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };

  console.log("Deploying Worker…");
  const deployOut = run("npx", ["wrangler", "deploy"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    quiet: true,
  });
  const urlMatch = deployOut.match(/https:\/\/[^\s]+\.workers\.dev/);
  const workerUrl = urlMatch ? urlMatch[0] : "(see wrangler output)";
  console.log(`Worker URL: ${workerUrl}`);

  console.log("Syncing Worker secrets…");
  run("npx", ["wrangler", "secret", "put", "BASEROW_API_KEY"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: baserowKey,
    quiet: true,
  });
  run("npx", ["wrangler", "secret", "put", "MAILCHIMP_API_KEY"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: mailchimpKey,
    quiet: true,
  });
  run("npx", ["wrangler", "secret", "put", "SYNC_SECRET"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: syncSecret,
    quiet: true,
  });
  console.log("Worker secrets synced.");

  try {
    setGhSecret("MAILCHIMP_API_KEY", mailchimpKey);
    setGhSecret("MAILCHIMP_AUDIENCE_ID", audienceId);
    setGhSecret("SUBSCRIBE_MAILCHIMP_SYNC_SECRET", syncSecret);
  } catch (error) {
    console.warn(
      "Could not set GitHub secrets (gh auth?). CI deploy will need them later:",
      error instanceof Error ? error.message : error,
    );
  }

  upsertEnvLines([
    `MAILCHIMP_AUDIENCE_ID=${audienceId}`,
    `SUBSCRIBE_MAILCHIMP_SYNC_SECRET=${syncSecret}`,
    `SUBSCRIBE_MAILCHIMP_SYNC_URL=${workerUrl}`,
  ]);
  console.log(`Updated ${ENV_PATH}.`);

  console.log(
    "\nDone.\n" +
      `- Manual sync: curl -X POST ${workerUrl}/ -H "Authorization: Bearer $SUBSCRIBE_MAILCHIMP_SYNC_SECRET"\n` +
      "- Local dry-run: npm run subscribe-mailchimp-sync -- --dry-run\n" +
      "- Cron: hourly (0 * * * *)",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
