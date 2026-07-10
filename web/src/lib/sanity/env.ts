const DEFAULT_PROJECT_ID = "pn5yjro6";
const DEFAULT_DATASET = "production";

export type SanityConfig = {
  projectId: string;
  dataset: string;
  token: string;
};

/** Vite dev reads ark/.env into import.meta.env; CI sets process.env. */
function readEnv(name: string): string | undefined {
  const fromVite = import.meta.env[name];
  if (typeof fromVite === "string" && fromVite.trim()) {
    return fromVite.trim();
  }

  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }

  return undefined;
}

export function getSanityConfig(): SanityConfig {
  const projectId = readEnv("SANITY_PROJECT_ID") || DEFAULT_PROJECT_ID;
  const dataset = readEnv("SANITY_DATASET") || DEFAULT_DATASET;
  const token = readEnv("SANITY_API_TOKEN");

  if (!token) {
    throw new Error(
      "SANITY_API_TOKEN is required. Add it to the repo root .env (local) or GitHub Actions secrets (CI).",
    );
  }

  return { projectId, dataset, token };
}
