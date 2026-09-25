export type DeployTarget = "staging" | "production";

export type Env = {
  DEPLOY_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
  /** Ops base URL for the scheduled auto-update tick. */
  OPS_URL?: string;
};

export type DeployRequest = {
  target?: DeployTarget;
};

export type PromoteRequest = {
  kind?: string;
  previewRunId?: number | string;
};

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

export type WorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  /** Workflow file path, e.g. .github/workflows/web.yml */
  path?: string;
  name?: string;
  display_title?: string;
  head_sha?: string;
};
