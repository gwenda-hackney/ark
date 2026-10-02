/** Types for sentry.js (TypeScript Workers and the ops browser app). */
export declare const SENTRY_DSN: { ops: string; web: string; workers: string };

export declare function sentryOptions(
  env: Record<string, unknown> | undefined,
  app: keyof typeof SENTRY_DSN,
  fallbackEnv?: string,
): {
  dsn: string;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
};
