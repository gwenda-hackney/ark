import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROJECT_ID = "pn5yjro6";
/** Local dev default. CI / wrangler sets SANITY_DATASET per environment. */
const DEFAULT_DATASET = "staging";

export type SanityConfig = {
  projectId: string;
  dataset: string;
  token: string;
};

export type SanityPerspective = "published" | "previewDrafts";

/** Local `astro dev` overlays drafts. Staging/production builds stay published. */
export function sanityPerspective(input: {
  perspective?: string;
  dev?: boolean;
} = {}): SanityPerspective {
  const explicit = (input.perspective ?? "").trim();
  if (explicit === "published" || explicit === "previewDrafts") return explicit;
  if (input.dev) return "previewDrafts";
  return "published";
}

function findRepoRoot(): string {
  const candidates = [
    // npm run web:dev → cwd is marketing/web/
    resolve(process.cwd(), "../.."),
    // import.meta.url fallback (build / SSR)
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.."),
    process.cwd(),
  ];

  for (const dir of candidates) {
    if (!existsSync(resolve(dir, "package.json"))) continue;
    if (
      existsSync(resolve(dir, "marketing/web")) &&
      existsSync(resolve(dir, "marketing/studio"))
    ) {
      return dir;
    }
  }

  return candidates[0];
}

function normalizeEnvValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** Parse ark/.env directly — used for scripts and CI fallbacks. */
function readDotEnv(name: string, root: string): string | undefined {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return undefined;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (key !== name) continue;

    return normalizeEnvValue(trimmed.slice(separator + 1));
  }

  return undefined;
}

function pickSanityToken(candidates: Array<string | undefined>): string | undefined {
  const normalized = candidates
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(normalizeEnvValue);

  const valid = normalized.filter(
    (value) => value.startsWith("sk") && value.length >= 100 && value.length <= 512,
  );

  if (valid.length === 0) return undefined;

  // Prefer the shortest valid token — polluted shell env often has trailing junk.
  return valid.sort((a, b) => a.length - b.length)[0];
}

function readEnv(name: string): string | undefined {
  // CI and explicit shell env win over Astro-inlined import.meta.env defaults.
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return normalizeEnvValue(fromProcess);
  }

  const meta = import.meta.env as Record<string, string | undefined>;
  const fromMeta = meta[name];
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return normalizeEnvValue(fromMeta);
  }

  const root = findRepoRoot();
  const fromFile = readDotEnv(name, root);
  if (fromFile) return fromFile;

  return undefined;
}

/** projectId + dataset only — enough to build image URLs, no API token needed. */
export function getSanityImageConfig(): Pick<SanityConfig, "projectId" | "dataset"> {
  const projectId = readEnv("SANITY_PROJECT_ID") || DEFAULT_PROJECT_ID;
  const dataset = readEnv("SANITY_DATASET") || DEFAULT_DATASET;
  return { projectId, dataset };
}

export function getSanityConfig(): SanityConfig {
  const { projectId, dataset } = getSanityImageConfig();
  const token = pickSanityToken([
    process.env.SANITY_API_TOKEN,
    import.meta.env.SANITY_API_TOKEN as string | undefined,
    readDotEnv("SANITY_API_TOKEN", findRepoRoot()),
  ]);

  if (!token) {
    const hint =
      dataset === "production"
        ? "GitHub secret SANITY_API_TOKEN (CI) or repo-root .env (local)."
        : "repo-root .env (local dev).";
    throw new Error(`SANITY_API_TOKEN is required — set it in ${hint}`);
  }

  return { projectId, dataset, token };
}
