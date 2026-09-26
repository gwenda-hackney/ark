export interface Env {
  HEALTH_STATE: KVNamespace;
  SITE_URL: string;
  PREVIEW_SITE_URL?: string;
  ALERT_EMAIL: string;
  /** Service account that sends as notifications@ (shared/gmail-send.js). */
  GMAIL_SERVICE_ACCOUNT_JSON?: string;
  HEALTH_STATUS_TOKEN?: string;
}

export type SiteId = "production" | "preview";

export type HealthState = {
  consecutiveFails: number;
  lastAlertAt: number | null;
  down: boolean;
  healthEndpointSeen: boolean;
  lastCheckedAt: number | null;
  lastError: string | null;
  lastProbe: ProbeResult | null;
};

export type ProbeCheck = {
  name: string;
  ok: boolean;
  status?: number;
  error?: string;
};

export type ProbeResult = {
  ok: boolean;
  checks: ProbeCheck[];
  env?: string | null;
  dataset?: string | null;
  commit?: string | null;
};

export type HealthAlert = "down" | "reminder" | "recovery" | null;

export type MonitoredSite = {
  id: SiteId;
  url: string;
  requireHome: boolean;
  alert: boolean;
};
