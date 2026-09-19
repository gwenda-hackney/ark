export interface Env {
  HEALTH_STATE: KVNamespace;
  SITE_URL: string;
  ALERT_EMAIL: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASSWORD?: string;
}

export type HealthState = {
  consecutiveFails: number;
  lastAlertAt: number | null;
  down: boolean;
  healthEndpointSeen: boolean;
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
};

export type HealthAlert = "down" | "reminder" | "recovery" | null;
