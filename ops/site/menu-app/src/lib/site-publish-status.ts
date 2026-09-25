export type SitePublishRun = {
  target: "preview" | "production";
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
  const site = run.target === "production" ? "Production" : "Preview";
  if (run.completed) {
    if (run.conclusion === "success") return `${site} site is published.`;
    if (run.conclusion === "cancelled") return `${site} publish was cancelled.`;
    return `${site} publish failed.`;
  }
  if (QUEUED.has(run.status)) return `${site} publish is queued.`;
  return `${site} site is building.`;
}

export function sitePublishHref(target: "preview" | "production"): string {
  return target === "production"
    ? "https://gwenda.co.uk/whats-on"
    : "https://preview.gwenda-blue.pages.dev/whats-on";
}
