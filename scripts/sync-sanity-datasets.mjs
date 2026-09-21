#!/usr/bin/env node
/**
 * Mirror one Sanity dataset onto another.
 *
 * Prefers Cloud Clone when the plan supports it. Otherwise: dataset export →
 * import --replace → delete target docs that are not in the source.
 * (`import --replace` alone only overwrites matching IDs and leaves orphans.)
 *
 * Local Studio + Dev Studio  → staging dataset (drafts locally, publish for the site)
 * Staging site               → published staging dataset
 * Prod Studio + live site    → production dataset (clone of staging)
 *
 * Usage (repo root):
 *   node --env-file=.env scripts/sync-sanity-datasets.mjs --direction staging-to-production --confirm production
 *   node --env-file=.env scripts/sync-sanity-datasets.mjs --direction production-to-staging --confirm staging
 *
 * Auth: SANITY_DATASET_SYNC_TOKEN, SANITY_AUTH_TOKEN, or SANITY_API_TOKEN.
 * Export/import needs a token that can write the target (personal admin or Editor).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO_DIR = resolve(ROOT, "marketing/studio");
const PROJECT_ID = process.env.SANITY_PROJECT_ID || "pn5yjro6";
const MANAGEMENT_API = "v2021-06-07";
const DATA_API = "v2024-01-01";

const DIRECTIONS = {
  "staging-to-production": {
    source: "staging",
    target: "production",
    label: "staging → production",
  },
  "production-to-staging": {
    source: "production",
    target: "staging",
    label: "production → staging",
  },
};

function parseArgs(argv) {
  const out = {
    direction: null,
    confirm: null,
    skipHistory: true,
    method: "auto",
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--direction") out.direction = argv[++i];
    else if (arg === "--confirm") out.confirm = argv[++i];
    else if (arg === "--keep-history") out.skipHistory = false;
    else if (arg === "--method") out.method = argv[++i];
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

async function managementRequest(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`https://api.sanity.io/${MANAGEMENT_API}${path}`, {
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
    const err = new Error(
      `Sanity API ${method} ${path} → ${res.status}: ${message}`,
    );
    err.status = res.status;
    err.bodyMessage = message;
    throw err;
  }
  return data;
}

async function dataQuery(dataset, token, groq) {
  const url = new URL(
    `https://${PROJECT_ID}.api.sanity.io/${DATA_API}/data/query/${dataset}`,
  );
  url.searchParams.set("query", groq);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Sanity query ${dataset} → ${res.status}: ${data.message || JSON.stringify(data)}`,
    );
  }
  return data.result;
}

async function dataMutate(dataset, token, mutations) {
  const res = await fetch(
    `https://${PROJECT_ID}.api.sanity.io/${DATA_API}/data/mutate/${dataset}?returnIds=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mutations }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Sanity mutate ${dataset} → ${res.status}: ${data.error?.description || JSON.stringify(data)}`,
    );
  }
  return data;
}

/**
 * User content ids only (skip Sanity system / schema docs that need manage).
 * @param {string} dataset
 * @param {string} token
 */
async function listContentIds(dataset, token) {
  const ids = await dataQuery(
    dataset,
    token,
    `*[!(_id in path("_.**")) && !(_id in path("system.**"))]._id`,
  );
  return new Set(Array.isArray(ids) ? ids : []);
}

/**
 * Delete target docs that are not in the source. Required after
 * `sanity dataset import --replace`, which only overwrites matching IDs.
 */
async function deleteOrphans({ token, source, target }) {
  const sourceIds = await listContentIds(source, token);
  const targetDocs = await dataQuery(
    target,
    token,
    `*[!(_id in path("_.**")) && !(_id in path("system.**"))]{ _id, _type, "label": coalesce(name, title, _id) }`,
  );
  const orphans = (Array.isArray(targetDocs) ? targetDocs : []).filter(
    (doc) => !sourceIds.has(doc._id),
  );

  if (orphans.length === 0) {
    console.log("No orphan documents on target.");
    return 0;
  }

  console.log(`Deleting ${orphans.length} orphan document(s) from ${target}:`);
  for (const doc of orphans) {
    console.log(`  ${doc._type} ${doc.label} (${doc._id})`);
  }

  // Sanity mutate batches; keep chunks modest.
  const chunkSize = 50;
  for (let i = 0; i < orphans.length; i += chunkSize) {
    const chunk = orphans.slice(i, i + chunkSize);
    await dataMutate(
      target,
      token,
      chunk.map((doc) => ({ delete: { id: doc._id } })),
    );
  }
  return orphans.length;
}

async function startCopy({ token, source, target, skipHistory }) {
  return managementRequest(`/projects/${PROJECT_ID}/datasets/${source}/copy`, {
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
  const data = await managementRequest(`/projects/${PROJECT_ID}/datasets/copy`, {
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

function cloudCloneUnavailable(err) {
  const msg = String(err?.bodyMessage || err?.message || "");
  return (
    /advanced dataset management/i.test(msg) ||
    /datasets\/create/i.test(msg) ||
    /missing required grant/i.test(msg) ||
    err?.status === 400 ||
    err?.status === 401 ||
    err?.status === 403
  );
}

function runSanityCli(args, token) {
  const result = spawnSync("npx", ["sanity", ...args], {
    cwd: STUDIO_DIR,
    env: {
      ...process.env,
      SANITY_AUTH_TOKEN: token,
      SANITY_PROJECT_ID: PROJECT_ID,
    },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`sanity ${args.join(" ")} failed (exit ${result.status})`);
  }
}

async function mirrorViaExportImport({ token, source, target }) {
  const dir = mkdtempSync(join(tmpdir(), "sanity-sync-"));
  const archive = join(dir, `${source}.tar.gz`);
  try {
    console.log(`Exporting ${source}…`);
    runSanityCli(
      [
        "dataset",
        "export",
        source,
        archive,
        "--project",
        PROJECT_ID,
        "--overwrite",
      ],
      token,
    );

    console.log(`Importing into ${target} (--replace)…`);
    runSanityCli(
      [
        "dataset",
        "import",
        archive,
        "--dataset",
        target,
        "--project",
        PROJECT_ID,
        "--replace",
      ],
      token,
    );

    console.log(
      "Removing target documents that were not in the source (import --replace leaves orphans)…",
    );
    await deleteOrphans({ token, source, target });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function mirrorViaCloudClone({ token, source, target, skipHistory }) {
  const started = await startCopy({ token, source, target, skipHistory });
  const jobId = started?.jobId || started?.id;
  console.log(`Started Cloud Clone job${jobId ? `: ${jobId}` : ""}.`);
  await waitForCopy({ token, source, target, jobId });
  // Belt-and-braces if the API ever merges into an existing dataset.
  await deleteOrphans({ token, source, target });
}

function printHelp() {
  console.log(`Mirror Sanity datasets (Cloud Clone, or export/import + orphan purge).

Directions:
  staging-to-production     staging → production
  production-to-staging     production → staging

Required:
  --direction <name>
  --confirm <target-dataset>   must match the dataset being overwritten

Optional:
  --method auto|cloud-clone|export-import   (default: auto)
  --keep-history                            Cloud Clone only

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

  if (!["auto", "cloud-clone", "export-import"].includes(args.method)) {
    throw new Error(`Unknown --method ${args.method}`);
  }

  const token = resolveToken();
  console.log(`Project ${PROJECT_ID}`);
  console.log(`Sync: ${dir.label}`);
  console.log(`Overwriting dataset: ${dir.target}`);
  console.log(`Method: ${args.method}`);

  if (args.method === "export-import") {
    await mirrorViaExportImport({
      token,
      source: dir.source,
      target: dir.target,
    });
  } else if (args.method === "cloud-clone") {
    console.log(`skipHistory: ${args.skipHistory}`);
    await mirrorViaCloudClone({
      token,
      source: dir.source,
      target: dir.target,
      skipHistory: args.skipHistory,
    });
  } else {
    console.log(`skipHistory: ${args.skipHistory}`);
    try {
      await mirrorViaCloudClone({
        token,
        source: dir.source,
        target: dir.target,
        skipHistory: args.skipHistory,
      });
    } catch (err) {
      if (!cloudCloneUnavailable(err)) throw err;
      console.warn(
        `Cloud Clone unavailable (${err.bodyMessage || err.message}). Falling back to export/import + orphan purge.`,
      );
      await mirrorViaExportImport({
        token,
        source: dir.source,
        target: dir.target,
      });
    }
  }

  console.log("\nDataset sync complete.");
  console.log(
    "Note: websites still serve the previous build until you run a content deploy (Studio Deploy site, or deploy-*-content workflows).",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
