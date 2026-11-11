/**
 * After the build: dist/_headers (version, cache lifetimes) and
 * dist/_routes.json (which addresses run Pages Functions), from
 * scripts/lib/pages-serving.mjs. The live site's build sends only the
 * Functions' own addresses to them; every other build keeps all of them on
 * the gate.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { headersFile, isLiveBuild, pagesRoutes } from "./lib/pages-serving.mjs";

const distDir = resolve(process.cwd(), "dist");
const script = resolve(process.cwd(), "scripts/compute-build-version.mjs");
const result = spawnSync("node", [script, "--export"], {
  env: process.env,
  encoding: "utf8",
});

const version = (result.stdout || "").trim();
if (!version) {
  console.log("Skipping _headers — no build version (local dev).");
  process.exit(0);
}

const live = isLiveBuild(process.env);

writeFileSync(
  resolve(distDir, "_headers"),
  headersFile({ version, sha: process.env.PUBLIC_BUILD_SHA || "", live }),
);
console.log(`Wrote dist/_headers (X-Gwenda-Version: ${version})`);

const routes = pagesRoutes({
  live,
  functionsDir: resolve(process.cwd(), "functions"),
});
writeFileSync(
  resolve(distDir, "_routes.json"),
  `${JSON.stringify(routes, null, 2)}\n`,
);
console.log(
  `Wrote dist/_routes.json (${live ? "live site" : "gated"}: Functions on ${routes.include.join(", ")})`,
);
