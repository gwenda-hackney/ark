/**
 * Mail diagnostics: send a burst of test emails in one invocation over SMTP or the Gmail API.
 * Only answers on the mail-test preview alias and only mails @gwenda.co.uk addresses.
 */
import { isGmailConfigured, sendGmail } from "../_lib/gmail-send.js";

const MAX_COUNT = 10;
const ALLOWED_DOMAIN = "@gwenda.co.uk";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isMailTestHost(url) {
  return url.hostname.startsWith("mail-test.") || url.hostname === "localhost";
}

function captureLogger(lines) {
  const push = (level) => (...args) => {
    const text = args
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    if (level !== "debug" && level !== "trace") lines.push(`${level}: ${text}`);
  };
  return {
    trace: push("trace"),
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    fatal: push("fatal"),
  };
}

async function sendSmtp(env, mail, logLines) {
  const nodemailer = await import("nodemailer");
  const port = Number(env.SMTP_PORT?.trim() || "587");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST?.trim(),
    port,
    secure: port === 465,
    auth: {
      user: env.SMTP_USER?.trim() ?? "",
      pass: (env.SMTP_PASSWORD ?? "").replace(/\s+/g, ""),
    },
    logger: captureLogger(logLines),
  });
  const info = await transport.sendMail(mail);
  return { id: info.messageId, response: info.response };
}

export async function onRequestGet({ request, env }) {
  if (!isMailTestHost(new URL(request.url))) return new Response("Not found", { status: 404 });
  return json({
    smtpUser: env.SMTP_USER?.trim() || null,
    smtpHost: env.SMTP_HOST?.trim() || null,
    smtpPasswordLength: (env.SMTP_PASSWORD ?? "").replace(/\s+/g, "").length,
    gmailConfigured: isGmailConfigured(env),
  });
}

export async function onRequestPost({ request, env }) {
  if (!isMailTestHost(new URL(request.url))) return new Response("Not found", { status: 404 });

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "gmail" ? "gmail" : "smtp";
  const to = String(body.to ?? "").trim().toLowerCase();
  const from = String(body.from ?? "").trim() || `Gwenda <${env.SMTP_USER?.trim()}>`;
  const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_COUNT);
  const delayMs = Math.min(Math.max(Number(body.delayMs) || 0, 0), 5000);

  if (!to.endsWith(ALLOWED_DOMAIN)) {
    return json({ error: `Recipient must be an ${ALLOWED_DOMAIN} address.` }, 400);
  }

  const batch = new Date().toISOString();
  const results = [];
  for (let i = 1; i <= count; i += 1) {
    const logLines = [];
    const started = Date.now();
    const mail = {
      from,
      to,
      subject: `Mail test ${mode} ${i}/${count} · ${batch}`,
      text: `Mail test via ${mode}, attempt ${i} of ${count}, batch ${batch}.`,
    };
    try {
      const sent = mode === "gmail" ? await sendGmail(env, mail) : await sendSmtp(env, mail, logLines);
      results.push({ attempt: i, ok: true, ms: Date.now() - started, ...sent, log: logLines });
    } catch (error) {
      results.push({
        attempt: i,
        ok: false,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
        log: logLines,
      });
    }
    if (delayMs && i < count) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return json({ mode, to, from, batch, results });
}
