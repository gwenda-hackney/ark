import { parseInviteChannel } from "./lib.js";
import type { ClickUpCustomField, ClickUpListTasksResponse, ClickUpTask, Guest } from "./types.js";

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

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function readFieldNames() {
  return {
    contact: env("CLICKUP_INVITE_CONTACT_FIELD", "Username/Email"),
    channel: env("CLICKUP_INVITE_CHANNEL_FIELD", "Channel"),
  };
}

function fieldValue(task: ClickUpTask, fieldName: string): string {
  const field = task.custom_fields?.find(
    (item) => item.name?.trim().toLowerCase() === fieldName.trim().toLowerCase(),
  );
  if (!field) return "";

  const value = field.value;
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") return record.name.trim();
    if (typeof record.label === "string") return record.label.trim();
    if (typeof record.value === "string") return record.value.trim();
  }
  return "";
}

function taskToGuest(task: ClickUpTask): Omit<Guest, "rowId" | "token" | "rsvpGuests"> {
  const fields = readFieldNames();
  const name = (task.name ?? "").trim();
  const contact = fieldValue(task, fields.contact) || null;
  const channel = parseInviteChannel(fieldValue(task, fields.channel));

  return {
    taskId: task.id,
    name,
    contact,
    channel,
    status: task.status?.status?.trim() || null,
  };
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
  return response;
}

async function fetchListTasks(apiKey: string, listId: string): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  let page = 0;

  while (true) {
    const response = await clickUpRequest(
      apiKey,
      `/list/${listId}/task?archived=false&subtasks=false&page=${page}`,
    );
    if (!response.ok) {
      throw new ClickUpError(
        "ClickUp guest list fetch failed",
        response.status,
        (await response.text()).slice(0, 300),
      );
    }

    const payload = (await response.json()) as ClickUpListTasksResponse;
    tasks.push(...(payload.tasks ?? []));
    if (payload.last_page || !payload.tasks?.length) break;
    page += 1;
  }

  return tasks;
}

export async function fetchGuestsFromClickUp(env: NodeJS.ProcessEnv): Promise<Guest[]> {
  const apiKey = env.CLICKUP_API_KEY?.trim();
  const listId = env.CLICKUP_INVITE_LIST_ID?.trim();
  if (!apiKey || !listId) {
    throw new ClickUpError(
      "CLICKUP_API_KEY and CLICKUP_INVITE_LIST_ID are required",
      0,
      "",
    );
  }

  const tasks = await fetchListTasks(apiKey, listId);
  return tasks
    .map(taskToGuest)
    .filter((guest) => guest.name)
    .map((guest) => ({
      ...guest,
      rowId: 0,
      token: null,
      rsvpGuests: null,
    }));
}
