/**
 * Website content (Sanity) for the production → dev copy: the real project's
 * one dataset, drafts included, exported and imported over Gwenda Dev's, then
 * every dev document the real project doesn't have is deleted, so dev ends up
 * the same as production. The real project is only read.
 *
 * Auth, per project: in CI the robot tokens SANITY_API_TOKEN__PRODUCTION
 * (reads the real project) and SANITY_API_TOKEN__DEV (writes Gwenda Dev),
 * exported by scripts/sm-export.mjs. Without them, your own `npx sanity login`.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../../../shared/sanity-projects.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const STUDIO = resolve(ROOT, "marketing/studio");
const SANITY = resolve(ROOT, "node_modules/.bin/sanity");
export const SANITY_DATASET = "production";
/**
 * Queries pin this version: from 2025-02-19 the API reads published documents
 * only, so drafts would look missing from production and be deleted from dev.
 */
const RAW_API_VERSION = "v2021-06-07";
/** Every document id, drafts and versions included; not Sanity's own `_.` ones. */
const ALL_IDS = '*[!(_id in path("_.**"))]._id';
/** Ids per delete. Each delete is one transaction. */
const DELETE_BATCH = 100;

/** Ids in dev that production doesn't have, sorted. */
export function idsOnlyIn(target, source) {
  const keep = new Set(source);
  return target.filter((id) => !keep.has(id)).sort();
}

/**
 * The token for each side, or none for both (personal login). One without the
 * other would read with one identity and write with another, so it stops.
 */
export function sanityTokens(env = process.env) {
  const source = env.SANITY_API_TOKEN__PRODUCTION?.trim() || "";
  const target = env.SANITY_API_TOKEN__DEV?.trim() || "";
  if (Boolean(source) !== Boolean(target)) {
    throw new Error(
      "Set both SANITY_API_TOKEN__PRODUCTION and SANITY_API_TOKEN__DEV, or neither (uses your Sanity login).",
    );
  }
  return { source, target };
}

/**
 * Copy the real project's content over Gwenda Dev's.
 * @param {{ dryRun?: boolean, env?: NodeJS.ProcessEnv, run?: typeof spawnSync,
 *   source?: string, target?: string }} [opts]
 */
export function copySanityContent({
  dryRun = false,
  env = process.env,
  run = spawnSync,
  source = REAL_SANITY_PROJECT_ID,
  target = DEV_SANITY_PROJECT_ID,
} = {}) {
  if (source === target) {
    throw new Error("Dev and real Sanity projects are the same. Refusing to import.");
  }
  const tokens = sanityTokens(env);
  console.log(`Sanity ${source}/${SANITY_DATASET} → ${target}/${SANITY_DATASET}`);
  console.log(tokens.source ? "Auth: project robot tokens." : "Auth: your Sanity login.");

  /**
   * Run the Sanity CLI against one project, named explicitly with -p.
   * With `capture`, returns stdout instead of showing it.
   */
  function sanity(projectId, token, args, { capture = false } = {}) {
    const childEnv = { ...env, SANITY_STUDIO_PROJECT_ID: projectId };
    if (token) childEnv.SANITY_AUTH_TOKEN = token;
    const result = run(SANITY, [...args, "-p", projectId], {
      cwd: STUDIO,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(`sanity ${args[0]} ${args[1]} failed (project ${projectId}).`);
    }
    return result.stdout;
  }

  /** Every document id in one project's dataset. */
  function allIds(projectId, token) {
    const out = sanity(
      projectId,
      token,
      ["documents", "query", ALL_IDS, "-d", SANITY_DATASET, "--api-version", RAW_API_VERSION],
      { capture: true },
    );
    const ids = JSON.parse(String(out || "[]"));
    if (!Array.isArray(ids)) throw new Error(`Unexpected id list from project ${projectId}.`);
    return ids;
  }

  /** Delete what dev has and production doesn't. */
  function removeExtras() {
    const extra = idsOnlyIn(allIds(target, tokens.target), allIds(source, tokens.source));
    if (!extra.length) {
      console.log("Dev has no documents production lacks.");
      return;
    }
    console.log(
      `${dryRun ? "[dry-run] would delete" : "Deleting"} ${extra.length} document(s) only in dev.`,
    );
    if (dryRun) return;
    for (let i = 0; i < extra.length; i += DELETE_BATCH) {
      const batch = extra.slice(i, i + DELETE_BATCH);
      sanity(target, tokens.target, ["documents", "delete", ...batch, "-d", SANITY_DATASET]);
    }
  }

  if (dryRun) {
    console.log("[dry-run] would export the real dataset and import it with --replace.");
    removeExtras();
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "gwenda-sanity-"));
  try {
    const file = join(dir, `${SANITY_DATASET}.tar.gz`);
    sanity(source, tokens.source, ["dataset", "export", SANITY_DATASET, file, "--overwrite"]);
    sanity(target, tokens.target, [
      "dataset",
      "import",
      file,
      SANITY_DATASET,
      "--replace",
      "--allow-failing-assets",
    ]);
    removeExtras();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
