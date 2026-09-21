export type DeployTarget = "staging" | "production";

export type ContentSummary = {
  menuSections: number;
  menuItems: number;
  events: number;
  draftsHeldBack: number;
};

export type DeployPhaseName = "deploy" | "preview" | "promote";

export type DeployTriggerResponse = {
  ok: boolean;
  target: DeployTarget;
  runId: number;
  runUrl: string;
  status: string;
  phase?: DeployPhaseName;
  alreadyRunning?: boolean;
  error?: string;
};

export type DeployStatusResponse = {
  ok: boolean;
  runId: number;
  runUrl: string;
  status: string;
  conclusion: string | null;
  completed: boolean;
  phase?: DeployPhaseName;
  previewUrl?: string;
  previewRunId?: number;
  error?: string;
};

export type PromoteTriggerResponse = {
  ok: boolean;
  target: "staging" | "production";
  phase: "promote";
  kind?: string;
  previewRunId?: number;
  runId: number;
  runUrl: string;
  status: string;
  alreadyRunning?: boolean;
  error?: string;
};

export function deployTargetForDataset(dataset: string): DeployTarget {
  if (dataset === "production") return "production";
  return "staging";
}

export function liveSiteUrl(target: DeployTarget): string {
  return target === "production"
    ? "https://gwenda.co.uk"
    : "https://gwenda-staging.pages.dev";
}

export function previewSiteUrl(): string {
  return "https://gwenda-staging.pages.dev";
}

export function deployToolTitle(target: DeployTarget): string {
  if (target === "production") return "Production (ops promote)";
  return "Rebuild staging";
}
