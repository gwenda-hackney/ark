import { getDeployStatus, promoteWebsite } from "./api";
import {
  sitePublishHref,
  sitePublishPhaseLabel,
  type SitePublishRun,
} from "./site-publish-status";

const KEY = "gwenda.sitePublish";
export const SITE_PUBLISH_EVENT = "gwenda-site-publish";

export { sitePublishHref, sitePublishPhaseLabel, type SitePublishRun };

export function readSitePublish(): SitePublishRun | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SitePublishRun;
    if (!parsed || !parsed.runId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSitePublish(run: SitePublishRun | null): SitePublishRun | null {
  if (typeof sessionStorage !== "undefined") {
    if (run) sessionStorage.setItem(KEY, JSON.stringify(run));
    else sessionStorage.removeItem(KEY);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SITE_PUBLISH_EVENT));
  }
  return run;
}

/** Rebuild staging. Production rebuilds come from a Release publish. */
export async function beginSitePublish(target: "staging"): Promise<SitePublishRun> {
  const result = await promoteWebsite(target);
  if (!result.runId) {
    throw new Error(result.error || "Site publish did not start.");
  }
  return writeSitePublish({
    target,
    runId: result.runId,
    runUrl: result.runUrl || "",
    status: result.alreadyRunning ? "in_progress" : "queued",
    conclusion: null,
    completed: false,
  }) as SitePublishRun;
}

export async function refreshSitePublish(run: SitePublishRun): Promise<SitePublishRun> {
  const status = await getDeployStatus(run.runId);
  return writeSitePublish({
    ...run,
    runUrl: status.runUrl || run.runUrl,
    status: status.status || run.status,
    conclusion: status.conclusion ?? null,
    completed: Boolean(status.completed),
  }) as SitePublishRun;
}
