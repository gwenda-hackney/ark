import type { ClickUpTask } from "./types";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

export class ClickUpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "ClickUpError";
  }
}

async function clickUpRequest(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${CLICKUP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ClickUpError(
      `ClickUp API ${init.method ?? "GET"} ${path} failed`,
      response.status,
      body,
    );
  }

  return response;
}

export async function getTask(
  apiKey: string,
  taskId: string,
  includeSubtasks = false,
): Promise<ClickUpTask> {
  const params = includeSubtasks ? "?include_subtasks=true" : "";
  const response = await clickUpRequest(apiKey, `/task/${taskId}${params}`);
  return response.json() as Promise<ClickUpTask>;
}

export async function setCustomFieldValue(
  apiKey: string,
  taskId: string,
  fieldId: string,
  value: unknown,
): Promise<void> {
  await clickUpRequest(apiKey, `/task/${taskId}/field/${fieldId}`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

export async function setTaskNotes(
  apiKey: string,
  taskId: string,
  notes: string,
  notesFieldId?: string,
): Promise<void> {
  if (notesFieldId) {
    await clickUpRequest(apiKey, `/task/${taskId}/field/${notesFieldId}`, {
      method: "POST",
      body: JSON.stringify({ value: notes }),
    });
    return;
  }

  const task = await getTask(apiKey, taskId);
  const existing = task.markdown_description ?? task.description ?? "";
  const separator = existing.trim() ? "\n\n" : "";
  const markdown = `${existing}${separator}${notes}`;

  await clickUpRequest(apiKey, `/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ markdown_description: markdown }),
  });
}
