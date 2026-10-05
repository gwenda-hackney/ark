/**
 * Website content (Sanity) for the production → dev copy: the real project's
 * one dataset, drafts included, exported and imported over Gwenda Dev's.
 * Documents are replaced by id; a document deleted from the real project stays
 * in dev until the dev dataset is recreated. The real project is only read.
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
  if (dryRun) {
    console.log("[dry-run] would export the real dataset and import it with --replace.");
    return;
  }

  /** Run the Sanity CLI against one project, named explicitly with -p. */
  function sanity(projectId, token, args) {
    const childEnv = { ...env, SANITY_STUDIO_PROJECT_ID: projectId };
    if (token) childEnv.SANITY_AUTH_TOKEN = token;
    const result = run(SANITY, [...args, "-p", projectId], {
      cwd: STUDIO,
      stdio: "inherit",
      env: childEnv,
    });
    if (result.status !== 0) {
      throw new Error(`sanity ${args[0]} ${args[1]} failed (project ${projectId}).`);
    }
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
