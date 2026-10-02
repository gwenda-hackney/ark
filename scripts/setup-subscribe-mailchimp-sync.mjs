#!/usr/bin/env node
/**
 * Deploy Baserow → Mailchimp subscribe sync Worker and sync secrets.
 *
 * Everything comes from Secrets Manager (bw-unlock): CLOUDFLARE_API_TOKEN, the
 * production Website Baserow token, MAILCHIMP_API_KEY and
 * SUBSCRIBE_MAILCHIMP_SYNC_SECRET (generated and stored if missing). CI
 * (workers.yml) reads the same keys when it redeploys the Worker.
 * Optional: MAILCHIMP_AUDIENCE_ID in the shell (defaults to the Gwenda audience).
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { loadAppSecretsFromSm, productionSecretValues, upsertSmSecret } from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "marketing/subscribe-mailchimp-sync");

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

function readWranglerAccountId() {
  const toml = readFileSync(resolve(WORKER_DIR, "wrangler.toml"), "utf8");
  const match = toml.match(/^account_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("account_id not found in wrangler.toml");
  return match[1];
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


/** Production values from Secrets Manager: the Website token (live Subscribers) and the Mailchimp keys. */
function productionSecrets() {
  const { values } = loadAppSecretsFromSm("web", "production");
  const production = productionSecretValues();
  return {
    baserowKey: values.get("BASEROW_API_KEY")?.trim() || "",
    mailchimpKey: production.get("MAILCHIMP_API_KEY")?.trim() || "",
    syncSecret: production.get("SUBSCRIBE_MAILCHIMP_SYNC_SECRET")?.trim() || "",
  };
}

async function main() {
  loadRepoEnv();

  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const secrets = productionSecrets();
  const { baserowKey, mailchimpKey } = secrets;
  const audienceId =
    process.env.MAILCHIMP_AUDIENCE_ID?.trim() || "e2c69d5d31";
  if (!cloudflareToken) throw new Error("CLOUDFLARE_API_TOKEN is missing. Run bw-unlock.");
  if (!baserowKey) throw new Error("BASEROW_WEBSITE_API_KEY__PRODUCTION is missing from Secrets Manager.");
  if (!mailchimpKey) throw new Error("MAILCHIMP_API_KEY__PRODUCTION is missing from Secrets Manager (Ark/Web).");

  await ensureSignedUpMergeField(mailchimpKey, audienceId);

  let syncSecret = secrets.syncSecret;
  if (!syncSecret) {
    syncSecret = randomBytes(32).toString("hex");
    upsertSmSecret({ key: "SUBSCRIBE_MAILCHIMP_SYNC_SECRET__PRODUCTION", value: syncSecret });
    console.log("Generated SUBSCRIBE_MAILCHIMP_SYNC_SECRET and stored it in Secrets Manager.");
  } else {
    console.log("Reusing SUBSCRIBE_MAILCHIMP_SYNC_SECRET from Secrets Manager.");
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
