const DEFAULT_PROJECT_ID = "pn5yjro6";
/** Local Studio + npm run web:dev — never write to production by accident. */
const DEFAULT_DATASET = "staging";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

export function getStudioProjectId(): string {
  return (
    readEnv("SANITY_STUDIO_PROJECT_ID") ||
    readEnv("SANITY_PROJECT_ID") ||
    DEFAULT_PROJECT_ID
  );
}

export function getStudioDataset(): string {
  return (
    readEnv("SANITY_STUDIO_DATASET") ||
    readEnv("SANITY_DATASET") ||
    DEFAULT_DATASET
  );
}
