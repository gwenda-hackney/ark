#!/usr/bin/env node
/**
 * Refresh the Gwenda Dev Sanity project from the real one: each has one
 * dataset, production, drafts included. Documents are replaced by id; a
 * document deleted from the real project stays in dev until the dev dataset
 * is recreated. The real project is only read.
 *
 * Uses your personal Sanity login (`npx sanity login`), not a robot token.
 *
 *   npm run dev:refresh:sanity
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEV_SANITY_PROJECT_ID,
  REAL_SANITY_PROJECT_ID,
} from "../ops/site/src/platform/sanity.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STUDIO = resolve(ROOT, "marketing/studio");
const SANITY = resolve(ROOT, "node_modules/.bin/sanity");
const DATASET = "production";

if (DEV_SANITY_PROJECT_ID === REAL_SANITY_PROJECT_ID) {
  throw new Error("Dev and real Sanity projects are the same. Refusing to import.");
}

/** Run the Sanity CLI against one project, named explicitly with -p. */
function sanity(projectId, args) {
  const result = spawnSync(SANITY, [...args, "-p", projectId], {
    cwd: STUDIO,
    stdio: "inherit",
    env: { ...process.env, SANITY_STUDIO_PROJECT_ID: projectId },
  });
  if (result.status !== 0) {
    throw new Error(`sanity ${args.join(" ")} failed (project ${projectId}).`);
  }
}

const dir = mkdtempSync(join(tmpdir(), "gwenda-sanity-"));
try {
  const file = join(dir, `${DATASET}.tar.gz`);
  console.log(`\n${REAL_SANITY_PROJECT_ID}/${DATASET} → ${DEV_SANITY_PROJECT_ID}/${DATASET}`);
  sanity(REAL_SANITY_PROJECT_ID, ["dataset", "export", DATASET, file, "--overwrite"]);
  sanity(DEV_SANITY_PROJECT_ID, ["dataset", "import", file, DATASET, "--replace", "--allow-failing-assets"]);
  console.log(`\nDone. Gwenda Dev (${DEV_SANITY_PROJECT_ID}) now matches the real project.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
