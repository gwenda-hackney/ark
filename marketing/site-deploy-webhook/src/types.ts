/**
 * What ops asks /deploy to rebuild. "staging" is the name ops used before the
 * preview moved onto drafts; prod ops still on that release sends it.
 */
export type DeployTarget = "preview" | "staging" | "production";

/**
 * A web.yml content build: prod's preview, or one of the dev website's sites
 * (gwenda-web-dev, from the Gwenda Dev copy) for dev ops.
 */
export type ContentTarget = "preview" | "dev-preview" | "dev-live";

/** Which environment's website a request is for (ops sends "dev" from dev ops). */
export type SiteEnvironment = "prod" | "dev";

export type Env = {
  DEPLOY_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
  /** Ops base URL for the scheduled auto-update tick. */
  OPS_URL?: string;
  /** Dev ops (gwenda-ops-dev), ticked the same way for the dev website. */
  OPS_DEV_URL?: string;
};

export type DeployRequest = {
  target?: DeployTarget;
  env?: SiteEnvironment;
};

export type PromoteRequest = {
  kind?: string;
  env?: SiteEnvironment;
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
