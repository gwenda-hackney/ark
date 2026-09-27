/**
 * One ClickUp task per event date: send a social post two weeks before.
 * Assignee comes from the Social role (an ops user email) matched to a
 * ClickUp member. A missing role still creates the task, unassigned.
 */
import { getConfigString } from "../../../platform/config-store.js";
import { resolveOccurrenceContent } from "./event-content.js";
import { parseIsoDate, todayIso, formatIsoDate } from "../event-recurrence.js";

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";
export const SOCIAL_ROLE_KEY = "tasks.role.social";
export const EVENTS_LIST_KEY = "clickup.events_list_id";

function addDaysIso(iso, days) {
  const date = parseIsoDate(iso);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

/** Unix ms for a date-only ClickUp due date. Past dates are due today. */
export function socialPostDueMs(eventDate, now = new Date()) {
  const due = addDaysIso(eventDate, -14);
  const today = todayIso(now);
  const chosen = due && due < today ? today : due;
  const parsed = parseIsoDate(chosen);
  return parsed ? parsed.getTime() : Date.now();
}

export function socialTaskFields({
  name,
  date,
  artist,
  offer,
  description,
  imageUrl,
  assigneeId,
  now,
}) {
  const who = artist ? `Artist: ${artist}\n` : "";
  const offerLine = offer ? `Offer: ${offer}\n` : "";
  const copy = description ? `Copy: ${description}\n` : "";
  const image = imageUrl ? `Image: ${imageUrl}\n` : "";
  return {
    name: `Send social post: ${name}`,
    description: `${who}${offerLine}${copy}${image}Event date: ${date}\nPost two weeks before this night.`,
    due_date: socialPostDueMs(date, now),
    due_date_time: false,
    assignees: assigneeId ? [assigneeId] : [],
  };
}

export function memberIdByEmail(payload, email) {
  const want = String(email || "")
    .trim()
    .toLowerCase();
  if (!want) return null;
  const teams = payload?.teams || [];
  for (const team of teams) {
    for (const member of team.members || []) {
      const user = member.user || member;
      const found = String(user.email || "")
        .trim()
        .toLowerCase();
      if (found === want) return user.id;
    }
  }
  return null;
}

async function clickup(env, path, init = {}) {
  const apiKey = env.CLICKUP_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error("CLICKUP_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${CLICKUP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.err || payload.error || `ClickUp failed (${response.status}).`,
    );
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return payload;
}

export async function resolveSocialAssignee(env) {
  const email = await getConfigString(env, SOCIAL_ROLE_KEY);
  if (!email) {
    return {
      assigneeId: null,
      warning: "Social role is not set. The task was left unassigned.",
    };
  }
  const teams = await clickup(env, "/team");
  const assigneeId = memberIdByEmail(teams, email);
  if (!assigneeId) {
    return {
      assigneeId: null,
      warning: `No ClickUp member matches ${email}. The task was left unassigned.`,
    };
  }
  return { assigneeId, warning: "" };
}

export async function upsertSocialTask(
  env,
  {
    listId,
    taskId,
    name,
    date,
    artist,
    offer,
    description,
    imageUrl,
    assigneeId,
  },
) {
  const fields = socialTaskFields({
    name,
    date,
    artist,
    offer,
    description,
    imageUrl,
    assigneeId,
  });
  if (taskId) {
    try {
      const current = await clickup(env, `/task/${encodeURIComponent(taskId)}`);
      const existing = (current.assignees || [])
        .map((user) => user.id)
        .filter(Boolean);
      const rem = assigneeId
        ? existing.filter((id) => id !== assigneeId)
        : existing;
      const updated = await clickup(
        env,
        `/task/${encodeURIComponent(taskId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name: fields.name,
            description: fields.description,
            due_date: fields.due_date,
            due_date_time: false,
            assignees: { add: fields.assignees, rem },
          }),
        },
      );
      return updated.id || taskId;
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
  }
  const created = await clickup(
    env,
    `/list/${encodeURIComponent(listId)}/task`,
    {
      method: "POST",
      body: JSON.stringify(fields),
    },
  );
  return created.id;
}

export async function syncSocialTasks(env, event, dates) {
  const warnings = [];
  const listId =
    (await getConfigString(env, EVENTS_LIST_KEY)) ||
    env.CLICKUP_EVENTS_LIST_ID?.trim() ||
    "";
  if (!listId) {
    warnings.push(
      "ClickUp events list is not configured. Social tasks were not created.",
    );
    return { dates, warnings };
  }
  if (!env.CLICKUP_API_KEY?.trim()) {
    warnings.push(
      "CLICKUP_API_KEY is not configured. Social tasks were not created.",
    );
    return { dates, warnings };
  }
  let assigneeId = null;
  try {
    const resolved = await resolveSocialAssignee(env);
    assigneeId = resolved.assigneeId;
    if (resolved.warning) warnings.push(resolved.warning);
  } catch (error) {
    warnings.push(error?.message || "Could not resolve the ClickUp assignee.");
  }
  const next = [];
  for (const date of dates) {
    try {
      const content = resolveOccurrenceContent(event, date);
      const taskId = await upsertSocialTask(env, {
        listId,
        taskId: date.clickupTaskId,
        name: content.title,
        date: date.date,
        artist: content.artist,
        offer: content.offer,
        description: content.description,
        imageUrl: content.image?.url || "",
        assigneeId,
      });
      next.push({ ...date, clickupTaskId: taskId });
    } catch (error) {
      warnings.push(
        error?.message || `Could not create the social task for ${date.date}.`,
      );
      next.push(date);
    }
  }
  return { dates: next, warnings };
}
