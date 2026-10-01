import {
  DEV_SANITY_PROJECT_ID as DEV_PROJECT_ID,
  REAL_SANITY_PROJECT_ID as DEFAULT_PROJECT_ID,
} from "../../../shared/sanity-projects.js";

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
