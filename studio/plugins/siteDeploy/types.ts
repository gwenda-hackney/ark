export type DeployTarget = "staging" | "production";

export type ContentSummary = {
  menuSections: number;
  menuItems: number;
  events: number;
  draftsHeldBack: number;
};

export type DeployTriggerResponse = {
  ok: boolean;
  target: DeployTarget;
  runId: number;
  runUrl: string;
  status: string;
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
  error?: string;
};

export function deployTargetForDataset(dataset: string): DeployTarget {
  return dataset === "production" ? "production" : "staging";
}

export function liveSiteUrl(target: DeployTarget): string {
  return target === "production"
    ? "https://gwenda.co.uk"
    : "https://gwenda-staging.pages.dev";
}

export function deployToolTitle(target: DeployTarget): string {
  return target === "production" ? "Deploy to live" : "Deploy to staging";
}
