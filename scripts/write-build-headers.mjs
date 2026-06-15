import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

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

const headers = `/*
  X-Gwenda-Version: ${version}
  X-Gwenda-Build-Sha: ${process.env.PUBLIC_BUILD_SHA || ""}

/_astro/logo.*
  X-Robots-Tag: noimageindex
`;

writeFileSync(resolve(distDir, "_headers"), headers);
console.log(`Wrote dist/_headers (X-Gwenda-Version: ${version})`);
