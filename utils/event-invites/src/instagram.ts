import type { InstagramConversation, InstagramPagedResponse } from "./types";

const GRAPH_BASE = "https://graph.instagram.com/v21.0";

export class InstagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramError";
  }
}

export class InstagramConfigError extends InstagramError {
  constructor(message: string) {
    super(message);
    this.name = "InstagramConfigError";
  }
}

export type InstagramConfig = {
  accessToken: string;
  businessAccountId: string;
};

export function readInstagramConfig(env: NodeJS.ProcessEnv): InstagramConfig {
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const businessAccountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  if (!accessToken || !businessAccountId) {
    throw new InstagramConfigError(
      "INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID are required for Instagram invites " +
        "(see utils/event-invites/README.md)",
    );
  }
  return { accessToken, businessAccountId };
}

export async function fetchUsernameToUserIdMap(
  config: InstagramConfig,
): Promise<Record<string, string>> {
  const handleMap: Record<string, string> = {};
  let url: string | null =
    `${GRAPH_BASE}/${config.businessAccountId}/conversations` +
    "?platform=instagram&fields=participants";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (!response.ok) {
      throw new InstagramError(
        `Instagram conversations failed (${response.status}): ${(await response.text()).slice(0, 400)}`,
      );
    }

    const payload = (await response.json()) as InstagramPagedResponse<InstagramConversation>;
    for (const conversation of payload.data ?? []) {
      collectParticipants(conversation, config.businessAccountId, handleMap);
    }
    url = payload.paging?.next ?? null;
  }

  return handleMap;
}

function collectParticipants(
  conversation: InstagramConversation,
  businessAccountId: string,
  handleMap: Record<string, string>,
): void {
  for (const participant of conversation.participants?.data ?? []) {
    const userId = participant.id?.trim();
    const username = participant.username?.trim().toLowerCase();
    if (!userId || userId === businessAccountId || !username) continue;
    handleMap[username] = userId;
  }
}

export async function sendDm(
  config: InstagramConfig,
  recipientId: string,
  text: string,
): Promise<string> {
  const response = await fetch(`${GRAPH_BASE}/${config.businessAccountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!response.ok) {
    throw new InstagramError(
      `Instagram send failed (${response.status}): ${(await response.text()).slice(0, 400)}`,
    );
  }

  const payload = (await response.json()) as { message_id?: string; id?: string };
  const messageId = payload.message_id ?? payload.id;
  if (!messageId) {
    throw new InstagramError("Instagram send returned no message id");
  }
  return messageId;
}
