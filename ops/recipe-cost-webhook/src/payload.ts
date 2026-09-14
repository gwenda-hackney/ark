import type { ClickUpWebhookPayload } from "./types";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNestedId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return readString((value as { id?: unknown }).id);
}

export function extractTaskId(payload: ClickUpWebhookPayload): string | undefined {
  return (
    readString(payload.task_id) ??
    readNestedId(payload.payload) ??
    readNestedId(payload.task)
  );
}

export function isAutomationPayload(payload: ClickUpWebhookPayload): boolean {
  return Boolean(payload.auto_id || payload.trigger_id || payload.payload);
}
