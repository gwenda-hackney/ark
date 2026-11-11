/**
 * Mailchimp's Marketing API, as far as the weekly email needs it (#240):
 * read the audience, make a draft campaign, fill it, send a test of it,
 * delete it, and, on production only, send it to the audience.
 *
 * The account has one audience, the real mailing list; there is no dev
 * audience. So the one call that reaches it (sendCampaignToAudience) checks
 * the environment itself, before any request, whoever calls it: off hosted
 * production it throws. Everything else only touches drafts, or one test
 * address.
 *
 * Secrets: MAILCHIMP_API_KEY (production only in Secrets Manager, so dev ops
 * normally has none) and the audience id, MAILCHIMP_AUDIENCE_ID (wrangler
 * [vars]). Without the key the weekly email page is preview-only.
 */
import { environmentOf } from "../../../../shared/config.js";

function key(env) {
  return String(env?.MAILCHIMP_API_KEY || "").trim();
}

export function mailchimpAudienceId(env) {
  return String(env?.MAILCHIMP_AUDIENCE_ID || "").trim();
}

/** The key's data centre ("us21" of "…-us21"), which is also its API host. */
function dataCentre(env) {
  const dc = key(env).split("-").pop() || "";
  return /^[a-z]+\d+$/.test(dc) && key(env).includes("-") ? dc : "";
}

/** Whether this runtime can talk to Mailchimp at all. */
export function mailchimpConfigured(env) {
  return Boolean(dataCentre(env) && mailchimpAudienceId(env));
}

/**
 * Hosted production ops: the only place the audience can be reached from.
 * Not dev, not a developer's machine, not a local copy on live data
 * (npm run ops:prod).
 */
export function canReachAudience(env) {
  let environment = "";
  try {
    environment = environmentOf(env);
  } catch {
    return false;
  }
  return environment === "production" && String(env?.OPS_LOCAL_LIVE || "") !== "1";
}

/** A refusal from Mailchimp, or no answer; `message` is fit to show. */
export class MailchimpError extends Error {
  constructor(message, { status = 0, detail = "" } = {}) {
    super(message);
    this.name = "MailchimpError";
    /** Mailchimp's HTTP status; 0 when there was no answer. */
    this.mailchimpStatus = status;
    this.detail = detail;
  }
}

async function call(env, method, path, body) {
  if (!mailchimpConfigured(env)) throw new MailchimpError("Mailchimp isn't connected here.");
  let response;
  try {
    response = await fetch(`https://${dataCentre(env)}.api.mailchimp.com/3.0${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`anystring:${key(env)}`)}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw new MailchimpError(`Mailchimp didn't answer (${error?.message || "network error"}).`);
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = String(payload?.detail || payload?.title || "").trim();
    throw new MailchimpError(`Mailchimp said no (${response.status})${detail ? `: ${detail}` : "."}`, {
      status: response.status,
      detail,
    });
  }
  return payload;
}

/** The audience: how many it would go to, and who its campaigns come from. */
export async function getAudience(env) {
  const id = mailchimpAudienceId(env);
  const list = await call(env, "GET", `/lists/${encodeURIComponent(id)}?fields=id,name,stats.member_count,campaign_defaults`);
  return {
    id: String(list?.id || id),
    name: String(list?.name || ""),
    memberCount: Number(list?.stats?.member_count) || 0,
    fromName: String(list?.campaign_defaults?.from_name || ""),
    replyTo: String(list?.campaign_defaults?.from_email || ""),
  };
}

function campaignOf(payload) {
  return {
    id: String(payload?.id || ""),
    webId: String(payload?.web_id || ""),
    /** save (a draft), schedule, sending, sent, paused, canceled. */
    status: String(payload?.status || ""),
    emailsSent: Number(payload?.emails_sent) || 0,
    sendTime: String(payload?.send_time || ""),
  };
}

/** A draft campaign for the audience. Nothing is sent. */
export async function createCampaign(env, { title, subject, preheader, fromName, replyTo }) {
  const payload = await call(env, "POST", "/campaigns", {
    type: "regular",
    recipients: { list_id: mailchimpAudienceId(env) },
    settings: {
      title,
      subject_line: subject,
      preview_text: preheader,
      from_name: fromName,
      reply_to: replyTo,
    },
  });
  const campaign = campaignOf(payload);
  if (!campaign.id) throw new MailchimpError("Mailchimp made a campaign without an id.");
  return campaign;
}

/** A draft's subject and preview line, when the week's email is rebuilt. */
export async function updateCampaign(env, id, { subject, preheader }) {
  return campaignOf(
    await call(env, "PATCH", `/campaigns/${encodeURIComponent(id)}`, {
      settings: { subject_line: subject, preview_text: preheader },
    }),
  );
}

export async function setCampaignContent(env, id, { html, text }) {
  await call(env, "PUT", `/campaigns/${encodeURIComponent(id)}/content`, { html, plain_text: text });
}

/** A test of a draft, to one address. The audience gets nothing. */
export async function sendCampaignTest(env, id, email) {
  await call(env, "POST", `/campaigns/${encodeURIComponent(id)}/actions/test`, {
    test_emails: [email],
    send_type: "html",
  });
}

export async function getCampaign(env, id) {
  return campaignOf(await call(env, "GET", `/campaigns/${encodeURIComponent(id)}?fields=id,web_id,status,emails_sent,send_time`));
}

export async function deleteCampaign(env, id) {
  await call(env, "DELETE", `/campaigns/${encodeURIComponent(id)}`);
}

/**
 * Send a campaign to the whole audience: real people's inboxes. Hosted
 * production only; anywhere else this throws before any request is made.
 * Mailchimp sends a campaign once: asking again for one that has gone is an
 * error, never a second send.
 */
export async function sendCampaignToAudience(env, id) {
  if (!canReachAudience(env)) {
    const error = new Error("Only production ops can send to the mailing list.");
    error.status = 403;
    throw error;
  }
  await call(env, "POST", `/campaigns/${encodeURIComponent(id)}/actions/send`);
}

/** The campaign in Mailchimp's own pages, for a link. "" without a key. */
export function campaignUrl(env, webId) {
  const dc = dataCentre(env);
  return dc && webId ? `https://${dc}.admin.mailchimp.com/campaigns/show/?id=${encodeURIComponent(webId)}` : "";
}
