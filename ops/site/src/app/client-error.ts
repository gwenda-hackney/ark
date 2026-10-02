/**
 * Root-level client error reporting for Ops: the console, and Sentry (#35).
 * Render crashes are also handled by <svelte:boundary> in App.svelte.
 */
import * as Sentry from "@sentry/svelte";
import { SENTRY_DSN } from "../../../../shared/sentry.js";

export type ClientErrorReport = {
  source: string;
  message: string;
  stack: string;
  name: string;
};

export function normalizeClientError(
  error: unknown,
): Omit<ClientErrorReport, "source"> {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack || "",
      name: error.name || "Error",
    };
  }
  if (typeof error === "string" && error.trim()) {
    return { message: error.trim(), stack: "", name: "Error" };
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = String(
      (error as { message?: unknown }).message || "Unknown error",
    );
    const stack =
      "stack" in error
        ? String((error as { stack?: unknown }).stack || "")
        : "";
    const name =
      "name" in error
        ? String((error as { name?: unknown }).name || "Error")
        : "Error";
    return { message, stack, name };
  }
  try {
    return { message: JSON.stringify(error), stack: "", name: "Error" };
  } catch {
    return { message: "Unknown error", stack: "", name: "Error" };
  }
}

export function reportClientError(
  source: string,
  error: unknown,
): ClientErrorReport {
  const normalized = normalizeClientError(error);
  const report: ClientErrorReport = { source, ...normalized };
  console.error(`[ops] ${source}: ${report.message}`, {
    name: report.name,
    stack: report.stack || undefined,
    error,
  });
  Sentry.captureException(error, { tags: { source } });
  return report;
}

/**
 * Which environment a browser is in, from the host: production ops, dev ops
 * or one of its branch previews, or "" on a developer's machine (no reports).
 */
export function browserEnvironment(host: string): string {
  if (host === "operations.gwenda.co.uk" || host === "gwenda-ops.pages.dev") {
    return "production";
  }
  if (
    host === "gwenda-ops-dev.pages.dev" ||
    host.endsWith(".gwenda-ops-dev.pages.dev")
  ) {
    return "dev";
  }
  return "";
}

export function installClientErrorHandlers(): void {
  if (typeof window === "undefined") return;
  const environment = browserEnvironment(window.location.host);
  Sentry.init({
    dsn: environment ? SENTRY_DSN.ops : "",
    enabled: Boolean(environment && SENTRY_DSN.ops),
    environment: environment || "local",
    tracesSampleRate: 0,
    // The handlers below report window errors themselves.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== "GlobalHandlers"),
  });
  window.addEventListener("error", (event) => {
    reportClientError("window.error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("unhandledrejection", event.reason);
  });
}
