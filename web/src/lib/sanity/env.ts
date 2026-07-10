import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const DEFAULT_PROJECT_ID = "pn5yjro6";
/** Local dev default — CI sets SANITY_DATASET=production explicitly. */
const DEFAULT_DATASET = "development";

export type SanityConfig = {
  projectId: string;
  dataset: string;
  token: string;
};

function findRepoRoot(): string {
  const candidates = [
    // npm run dev -w @gwenda/web → cwd is web/
    resolve(process.cwd(), ".."),
    // import.meta.url fallback (build / SSR)
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."),
    process.cwd(),
  ];

  for (const dir of candidates) {
    if (existsSync(resolve(dir, ".env")) || existsSync(resolve(dir, "package.json"))) {
      const hasWorkspaces =
        existsSync(resolve(dir, "web")) && existsSync(resolve(dir, "studio"));
      if (hasWorkspaces) return dir;
    }
  }

  return candidates[0];
}

const REPO_ROOT = findRepoRoot();

let cachedEnv: Record<string, string> | undefined;

function loadRootEnv(): Record<string, string> {
  if (!cachedEnv) {
    const mode = import.meta.env.MODE ?? "development";
    cachedEnv = loadEnv(mode, REPO_ROOT, "");
  }
  return cachedEnv;
}

function normalizeEnvValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** Prefer ark/.env via Vite. Fall back to process.env only in CI (no .env on disk). */
function readEnv(name: string): string | undefined {
  const fromFile = loadRootEnv()[name];
  if (typeof fromFile === "string" && fromFile.trim()) {
    return normalizeEnvValue(fromFile);
  }

  if (!existsSync(resolve(REPO_ROOT, ".env"))) {
    const fromProcess = process.env[name];
    if (typeof fromProcess === "string" && fromProcess.trim()) {
      return normalizeEnvValue(fromProcess);
    }
  }

  return undefined;
}

export function getSanityConfig(): SanityConfig {
  const projectId = readEnv("SANITY_PROJECT_ID") || DEFAULT_PROJECT_ID;
  const dataset = readEnv("SANITY_DATASET") || DEFAULT_DATASET;
  const token = readEnv("SANITY_API_TOKEN");

  if (!token) {
    throw new Error(
      `SANITY_API_TOKEN is required in ${resolve(REPO_ROOT, ".env")} (local) or GitHub Actions secrets (CI).`,
    );
  }

  return { projectId, dataset, token };
}
