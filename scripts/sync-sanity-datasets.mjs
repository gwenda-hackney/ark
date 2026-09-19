#!/usr/bin/env node
/**
 * Mirror one Sanity dataset onto another (Cloud Clone).
 *
 * Staging site → development dataset
 * Live site    → production dataset
 *
 * Usage (repo root):
 *   node --env-file=.env scripts/sync-sanity-datasets.mjs --direction staging-to-production --confirm production
 *   node --env-file=.env scripts/sync-sanity-datasets.mjs --direction production-to-staging --confirm development
 *
 * Auth: SANITY_DATASET_SYNC_TOKEN (Editor robot), or SANITY_AUTH_TOKEN / SANITY_API_TOKEN.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_ID = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const API_VERSION = "v2021-06-07";

const DIRECTIONS = {
  "staging-to-production": {
    source: "development",
    target: "production",
    label: "staging (development) → production",
  },
  "production-to-staging": {
    source: "production",
    target: "development",
    label: "production → staging (development)",
  },
};

function parseArgs(argv) {
  const out = {
    direction: null,
    confirm: null,
    skipHistory: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--direction") out.direction = argv[++i];
    else if (arg === "--confirm") out.confirm = argv[++i];
    else if (arg === "--keep-history") out.skipHistory = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function resolveToken() {
  const token =
    process.env.SANITY_DATASET_SYNC_TOKEN?.trim() ||
    process.env.SANITY_AUTH_TOKEN?.trim() ||
    process.env.SANITY_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Missing Sanity token. Set SANITY_DATASET_SYNC_TOKEN (preferred), SANITY_AUTH_TOKEN, or SANITY_API_TOKEN.",
    );
  }
  return token;
}

async function sanityRequest(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`https://api.sanity.io/${API_VERSION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String(data.message)
        : text || res.statusText;
    throw new Error(`Sanity API ${method} ${path} → ${res.status}: ${message}`);
  }
  return data;
}

async function startCopy({ token, source, target, skipHistory }) {
  return sanityRequest(`/projects/${PROJECT_ID}/datasets/${source}/copy`, {
    method: "PUT",
    token,
    body: {
      targetDataset: target,
      skipHistory,
      skipContentReleases: true,
    },
  });
}

async function listCopyJobs(token) {
  const data = await sanityRequest(`/projects/${PROJECT_ID}/datasets/copy`, {
    token,
  });
  return Array.isArray(data) ? data : data?.jobs || [];
}

function jobMatches(job, source, target, jobId) {
  if (jobId && (job.id === jobId || job.jobId === jobId)) return true;
  const src = job.sourceDataset || job.source || job.from;
  const dst = job.targetDataset || job.target || job.to;
  return src === source && dst === target;
}

function jobState(job) {
  return String(job.state || job.status || "").toLowerCase();
}

async function waitForCopy({ token, source, target, jobId }) {
  const started = Date.now();
  const timeoutMs = 30 * 60 * 1000;
  let lastState = "";

  while (Date.now() - started < timeoutMs) {
    const jobs = await listCopyJobs(token);
    const job =
      jobs.find((j) => jobMatches(j, source, target, jobId)) || jobs[0];
    if (!job) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const state = jobState(job);
    if (state && state !== lastState) {
      console.log(`Copy job ${job.id || job.jobId || "(unknown)"}: ${state}`);
      lastState = state;
    }

    if (["completed", "complete", "success", "succeeded"].includes(state)) {
      return job;
    }
    if (["failed", "cancelled", "canceled", "error"].includes(state)) {
      throw new Error(
        `Dataset copy failed (${state}): ${JSON.stringify(job)}`,
      );
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error("Timed out waiting for Sanity dataset copy to finish.");
}

function printHelp() {
  console.log(`Mirror Sanity datasets (Cloud Clone).

Directions:
  staging-to-production   development → production
  production-to-staging   production → development

Required:
  --direction <name>
  --confirm <target-dataset>   must match the dataset being overwritten

Example:
  node scripts/sync-sanity-datasets.mjs --direction staging-to-production --confirm production
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.direction) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const dir = DIRECTIONS[args.direction];
  if (!dir) {
    throw new Error(
      `Unknown --direction ${args.direction}. Use: ${Object.keys(DIRECTIONS).join(", ")}`,
    );
  }

  if (args.confirm !== dir.target) {
    throw new Error(
      `Refusing to run: --confirm must be exactly "${dir.target}" (got ${JSON.stringify(args.confirm)}).\n` +
        `This overwrites the entire ${dir.target} dataset.`,
    );
  }

  const token = resolveToken();
  console.log(`Project ${PROJECT_ID}`);
  console.log(`Sync: ${dir.label}`);
  console.log(`Overwriting dataset: ${dir.target}`);
  console.log(`skipHistory: ${args.skipHistory}`);

  const started = await startCopy({
    token,
    source: dir.source,
    target: dir.target,
    skipHistory: args.skipHistory,
  });
  const jobId = started?.jobId || started?.id;
  console.log(`Started copy job${jobId ? `: ${jobId}` : ""}.`);

  await waitForCopy({
    token,
    source: dir.source,
    target: dir.target,
    jobId,
  });

  console.log("\nDataset sync complete.");
  console.log(
    "Note: websites still serve the previous build until you run a content deploy (Studio Deploy site, or deploy-*-content workflows).",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
