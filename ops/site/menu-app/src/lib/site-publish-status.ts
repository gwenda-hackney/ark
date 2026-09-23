export type SitePublishRun = {
  target: "staging" | "production";
  runId: number;
  runUrl: string;
  status: string;
  conclusion: string | null;
  completed: boolean;
};

const QUEUED = new Set(["queued", "waiting", "pending", "requested"]);

export function sitePublishPhaseLabel(
  run: Pick<SitePublishRun, "target" | "status" | "conclusion" | "completed">,
): string {
  const site = run.target === "production" ? "Production" : "Staging";
  if (run.completed) {
    if (run.conclusion === "success") return `${site} site is published.`;
    if (run.conclusion === "cancelled") return `${site} publish was cancelled.`;
    return `${site} publish failed.`;
  }
  if (QUEUED.has(run.status)) return `${site} publish is queued.`;
  return `${site} site is building.`;
}

export function sitePublishHref(target: "staging" | "production"): string {
  return target === "production"
    ? "https://gwenda.co.uk/whats-on"
    : "https://gwenda-staging.pages.dev/whats-on";
}
