/** Injected at CI build time — empty when running locally. */
export const buildSha = import.meta.env.PUBLIC_BUILD_SHA ?? "";
export const buildRef = import.meta.env.PUBLIC_BUILD_REF ?? "";
export const buildTime = import.meta.env.PUBLIC_BUILD_TIME ?? "";
/** CalVer label: YYYY.MM.DD+shortsha */
export const buildVersion = import.meta.env.PUBLIC_BUILD_VERSION ?? "";

export function shortSha(sha = buildSha): string {
  return sha ? sha.slice(0, 7) : "";
}

/** Date portion of the CalVer label (e.g. 2026.06.08). */
export function versionDate(version = buildVersion): string {
  return version ? version.split("+")[0] : "";
}

/** Human-readable label for staging UI / support checks. */
export function buildLabel(): string {
  if (!buildSha) return "local dev";

  const parts: string[] = [];
  if (buildVersion) parts.push(buildVersion);
  else parts.push(shortSha());
  if (buildRef) parts.push(buildRef);
  if (buildTime) {
    parts.push(
      new Date(buildTime).toISOString().slice(0, 16).replace("T", " "),
    );
  }
  return parts.join(" · ");
}
