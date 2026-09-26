const DEFAULT_PROJECT_ID = "pn5yjro6";
/** The Gwenda Dev copy (ops/site/functions/_lib/sanity.js DEV_SANITY_PROJECT_ID). */
const DEV_PROJECT_ID = "gwscpagy";

export function isDevProject(projectId: string): boolean {
  return projectId === DEV_PROJECT_ID;
}

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
