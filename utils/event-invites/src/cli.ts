#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { ensureGuestInvite, BaserowError } from "./baserow.js";
import { fetchGuestsFromBaserow, BaserowGuestError } from "./baserow-guests.js";
import { EmailConfigError, EmailSendError, sendInviteEmail } from "./email.js";
import {
  fetchUsernameToUserIdMap,
  InstagramConfigError,
  InstagramError,
  readInstagramConfig,
  sendDm,
} from "./instagram.js";
import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_INSTAGRAM_MESSAGE,
  formatInviteContent,
  guestEmail,
  guestInstagramHandle,
  resolveInstagramRecipientId,
} from "./lib.js";
import type { Guest } from "./types.js";

type ManualInstagramRow = {
  name: string;
  contact: string;
  row_id: number;
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function writeManualInstagramCsv(path: string, rows: ManualInstagramRow[]): void {
  const header = "name,contact,row_id";
  const lines = rows.map(
    (row) => [row.name, row.contact, String(row.row_id)].map(csvEscape).join(","),
  );
  writeFileSync(path, `${header}\n${lines.join("\n")}\n`, "utf8");
}

function guestsNeedInstagram(guests: Guest[]): boolean {
  return guests.some((guest) => guest.channel === "instagram");
}

function printHelp(): void {
  console.log(`Usage: event-invites [options]

Send private event invites from a Baserow guest list.
Each guest gets a personal link: {invite-base}/invite/{token}

Baserow columns: Event Slug, Name, Channel (Email | Instagram), Contact.

Options:
  --event-slug <slug>              Sanity event slug (or INVITE_EVENT_SLUG) — required
  --invite-base-url <url>          Site origin (or INVITE_BASE_URL)
  --invite-image-url <url>         Invite image for email (or INVITE_IMAGE_URL)
  --email-subject <text>           Email subject
  --email-body <text>              Email body ({name}, {link}, {image})
  --instagram-message <text>       Instagram DM ({name}, {link})
  --dry-run                        Preview sends without delivering
  --send                           Register links + send invites
  --export-manual-instagram <csv>  Instagram guests needing manual DM
  --limit <n>                      Process at most N guests
  -h, --help                       Show this help
`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h", default: false },
      "invite-base-url": { type: "string", default: env("INVITE_BASE_URL", "https://gwenda.co.uk") },
      "invite-image-url": {
        type: "string",
        default: env("INVITE_IMAGE_URL", "https://gwenda.co.uk/images/event-invite.jpg"),
      },
      "event-slug": { type: "string", default: env("INVITE_EVENT_SLUG", "") },
      "email-subject": {
        type: "string",
        default: env("INVITE_EMAIL_SUBJECT", "You are invited — Gwenda"),
      },
      "email-body": { type: "string", default: env("INVITE_EMAIL_BODY", DEFAULT_EMAIL_BODY) },
      "instagram-message": {
        type: "string",
        default: env("INVITE_INSTAGRAM_MESSAGE", DEFAULT_INSTAGRAM_MESSAGE),
      },
      "dry-run": { type: "boolean", default: false },
      send: { type: "boolean", default: false },
      "export-manual-instagram": { type: "string" },
      limit: { type: "string", default: "0" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  const eventSlug = values["event-slug"] ?? env("INVITE_EVENT_SLUG");
  if (!eventSlug) {
    console.error("Error: --event-slug or INVITE_EVENT_SLUG is required");
    return 1;
  }

  if (!values["dry-run"] && !values.send && !values["export-manual-instagram"]) {
    console.error("Nothing to do — pass --dry-run, --send, and/or --export-manual-instagram");
    return 1;
  }

  let guests: Guest[];
  try {
    guests = await fetchGuestsFromBaserow(process.env, eventSlug);
  } catch (error) {
    if (error instanceof BaserowGuestError) {
      console.error(`Baserow error: ${error.message} (${error.status}) ${error.body}`);
      return 1;
    }
    throw error;
  }

  const limit = Number(values.limit ?? "0");
  if (limit > 0) guests = guests.slice(0, limit);

  console.log(`Loaded ${guests.length} guest(s) from Baserow for event ${eventSlug}`);

  const inviteBaseUrl = values["invite-base-url"] ?? "https://gwenda.co.uk";
  const inviteImageUrl = values["invite-image-url"] ?? "https://gwenda.co.uk/images/event-invite.jpg";
  const emailSubject = values["email-subject"] ?? "You are invited — Gwenda";
  const emailBodyTemplate = values["email-body"] ?? DEFAULT_EMAIL_BODY;
  const instagramTemplate = values["instagram-message"] ?? DEFAULT_INSTAGRAM_MESSAGE;

  let conversationMap: Record<string, string> = {};
  if (guestsNeedInstagram(guests)) {
    try {
      conversationMap = await fetchUsernameToUserIdMap(readInstagramConfig(process.env));
      console.log(
        `Indexed ${Object.keys(conversationMap).length} Instagram handle(s) from open conversations`,
      );
    } catch (error) {
      if (error instanceof InstagramConfigError) {
        if (values.send) {
          console.error(`Instagram config error: ${error.message}`);
          return 1;
        }
        console.log(`Note: ${error.message} — manual Instagram export only`);
      } else {
        throw error;
      }
    }
  }

  let emailCount = 0;
  let instagramSent = 0;
  let instagramManual = 0;
  let skipped = 0;
  const manualRows: ManualInstagramRow[] = [];

  for (const guest of guests) {
    if (!guest.channel || !guest.contact) {
      skipped += 1;
      if (values["dry-run"]) console.log(`[skip] ${guest.name} — missing channel or contact`);
      continue;
    }

    let inviteUrl = `${inviteBaseUrl}/invite/<token>`;
    if (values.send) {
      try {
        const invite = await ensureGuestInvite(
          process.env,
          guest,
          inviteBaseUrl,
          eventSlug,
        );
        inviteUrl = invite.inviteUrl;
      } catch (error) {
        if (error instanceof BaserowError) {
          console.error(`Baserow error for ${guest.name}: ${error.message}`);
          return 1;
        }
        throw error;
      }
    }

    const contentValues = {
      name: guest.name,
      link: inviteUrl,
      image: inviteImageUrl,
    };

    if (guest.channel === "email") {
      const to = guestEmail(guest);
      if (!to) {
        skipped += 1;
        if (values["dry-run"]) console.log(`[skip] ${guest.name} — channel email but no address`);
        continue;
      }

      const body = formatInviteContent(emailBodyTemplate, contentValues);
      if (values["dry-run"]) {
        console.log(`[email] ${to} (${guest.name}) → ${inviteUrl}`);
        emailCount += 1;
      } else if (values.send) {
        try {
          await sendInviteEmail(process.env, to, emailSubject, body, {
            inviteUrl,
            imageUrl: inviteImageUrl,
          });
          console.log(`Email → ${to} (${guest.name}) ${inviteUrl}`);
          emailCount += 1;
        } catch (error) {
          const message =
            error instanceof EmailConfigError || error instanceof EmailSendError
              ? error.message
              : String(error);
          console.error(`Email failed → ${guest.name}: ${message}`);
          if (error instanceof EmailConfigError) return 1;
        }
      }
      continue;
    }

    const handle = guestInstagramHandle(guest);
    const recipientId = resolveInstagramRecipientId(handle, conversationMap);
    const text = formatInviteContent(instagramTemplate, contentValues);

    if (recipientId) {
      if (values["dry-run"]) {
        console.log(`[instagram] @${handle ?? recipientId} (${guest.name}) → ${inviteUrl}`);
        instagramSent += 1;
      } else if (values.send) {
        try {
          const config = readInstagramConfig(process.env);
          const messageId = await sendDm(config, recipientId, text);
          console.log(`Instagram → @${handle ?? recipientId} (${guest.name}) id=${messageId}`);
          instagramSent += 1;
        } catch (error) {
          const message = error instanceof InstagramError ? error.message : String(error);
          console.error(`Instagram failed → ${guest.name}: ${message}`);
        }
      }
      continue;
    }

    instagramManual += 1;
    manualRows.push({
      name: guest.name,
      contact: handle ? `@${handle}` : guest.contact,
      row_id: guest.rowId,
    });
    if (values["dry-run"]) {
      console.log(
        `[manual ig] ${handle ? `@${handle}` : guest.contact} (${guest.name}) → ${inviteUrl}`,
      );
    }
  }

  if (values["export-manual-instagram"]) {
    writeManualInstagramCsv(values["export-manual-instagram"], manualRows);
    console.log(`Wrote ${manualRows.length} manual Instagram row(s) to ${values["export-manual-instagram"]}`);
  }

  if (values["dry-run"]) {
    console.log(
      `Summary: ${emailCount} email, ${instagramSent} Instagram via API, ` +
        `${instagramManual} manual Instagram, ${skipped} skipped`,
    );
  } else if (values.send) {
    console.log(`Sent ${emailCount} email(s) and ${instagramSent} Instagram DM(s)`);
  }

  return 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
