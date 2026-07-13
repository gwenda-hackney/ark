import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_INSTAGRAM_MESSAGE,
  formatInviteContent,
  guestEmail,
  guestInstagramHandle,
  normalizeInstagramHandle,
} from "./invite-lib.js";
import { ensureGuestToken, fetchGuestsForEvent } from "./event-guests.js";

const GRAPH_BASE = "https://graph.instagram.com/v21.0";

function readInviteEnv(env) {
  return {
    inviteBaseUrl: (env.INVITE_BASE_URL || "https://gwenda.co.uk").replace(/\/$/, ""),
    inviteImageUrl:
      env.INVITE_IMAGE_URL || "https://gwenda.co.uk/images/event-invite.jpg",
    emailSubject: env.INVITE_EMAIL_SUBJECT || "You are invited — Gwenda",
    emailBody: env.INVITE_EMAIL_BODY || DEFAULT_EMAIL_BODY,
    instagramMessage: env.INVITE_INSTAGRAM_MESSAGE || DEFAULT_INSTAGRAM_MESSAGE,
  };
}

async function fetchInstagramHandleMap(env) {
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const businessAccountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  if (!accessToken || !businessAccountId) return {};

  const handleMap = {};
  let url =
    `${GRAPH_BASE}/${businessAccountId}/conversations` +
    "?platform=instagram&fields=participants";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) break;

    const payload = await response.json();
    for (const conversation of payload.data ?? []) {
      for (const participant of conversation.participants?.data ?? []) {
        const userId = participant.id?.trim();
        const username = participant.username?.trim().toLowerCase();
        if (!userId || userId === businessAccountId || !username) continue;
        handleMap[username] = userId;
      }
    }
    url = payload.paging?.next ?? null;
  }

  return handleMap;
}

async function sendInstagramDm(env, recipientId, text) {
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const businessAccountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  if (!accessToken || !businessAccountId) {
    throw new Error("Instagram is not configured.");
  }

  const response = await fetch(`${GRAPH_BASE}/${businessAccountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  if (!response.ok) {
    throw new Error(`Instagram send failed (${response.status}).`);
  }
}

function inviteEmailHtml(bodyText, inviteUrl, imageUrl) {
  const escaped = bodyText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const paragraphs = escaped
    .split("\n")
    .map((line) =>
      line.trim() ? `<p style="margin:0 0 1rem;line-height:1.6;">${line}</p>` : "",
    )
    .join("");

  return `<!doctype html>
<html><body style="background:#0d0d0d;color:#e8e4dc;font-family:Georgia,serif;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <img src="${imageUrl}" alt="Gwenda invitation" style="width:100%;height:auto;border-radius:2px;margin-bottom:24px;" />
    ${paragraphs}
    <p style="margin:2rem 0 0;">
      <a href="${inviteUrl}" style="display:inline-block;padding:0.85rem 1.5rem;background:#c9a84c;color:#0d0d0d;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:0.8rem;">Open your invitation</a>
    </p>
  </div>
</body></html>`;
}

async function sendInviteEmail(env, to, subject, bodyText, inviteUrl, imageUrl) {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) {
    throw new Error("SMTP is not configured — use npm run event-invites -- --send locally.");
  }

  const nodemailer = await import("nodemailer");
  const port = Number(env.SMTP_PORT?.trim() || "587");
  const user = env.SMTP_USER?.trim() ?? "";
  const password = env.SMTP_PASSWORD?.trim() ?? "";

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && password ? { user, pass: password } : undefined,
  });

  await transport.sendMail({
    from,
    to,
    subject,
    text: bodyText,
    html: inviteEmailHtml(bodyText, inviteUrl, imageUrl),
  });
}

export async function sendEventInvites(env, eventSlug, { dryRun = false } = {}) {
  const loaded = await fetchGuestsForEvent(env, eventSlug);
  if (!loaded.ok) return loaded;

  const settings = readInviteEnv(env);
  const conversationMap = await fetchInstagramHandleMap(env);

  let emailCount = 0;
  let instagramSent = 0;
  let instagramManual = 0;
  let skipped = 0;
  const manualInstagram = [];

  for (const guest of loaded.guests) {
    if (!guest.channel || !guest.contact) {
      skipped += 1;
      continue;
    }

    let inviteUrl = `${settings.inviteBaseUrl}/invite/<token>`;
    if (!dryRun) {
      const invite = await ensureGuestToken(
        env,
        guest,
        settings.inviteBaseUrl,
        eventSlug,
      );
      inviteUrl = invite.inviteUrl;
    }

    const content = {
      name: guest.name,
      link: inviteUrl,
      image: settings.inviteImageUrl,
    };

    if (guest.channel === "email") {
      const to = guestEmail(guest);
      if (!to) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        emailCount += 1;
        continue;
      }
      const body = formatInviteContent(settings.emailBody, content);
      await sendInviteEmail(
        env,
        to,
        settings.emailSubject,
        body,
        inviteUrl,
        settings.inviteImageUrl,
      );
      emailCount += 1;
      continue;
    }

    const handle = guestInstagramHandle(guest);
    const recipientId = handle ? conversationMap[handle] : null;
    const text = formatInviteContent(settings.instagramMessage, content);

    if (recipientId) {
      if (!dryRun) await sendInstagramDm(env, recipientId, text);
      instagramSent += 1;
      continue;
    }

    instagramManual += 1;
    manualInstagram.push({
      name: guest.name,
      contact: handle ? `@${handle}` : guest.contact,
    });
  }

  return {
    ok: true,
    status: 200,
    dryRun,
    emailCount,
    instagramSent,
    instagramManual,
    skipped,
    manualInstagram,
  };
}
