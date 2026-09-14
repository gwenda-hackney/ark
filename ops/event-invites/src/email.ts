import nodemailer from "nodemailer";

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

function readSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  const port = Number(env.SMTP_PORT?.trim() || "587");
  if (!host || !from) {
    throw new EmailConfigError(
      "SMTP_HOST and SMTP_FROM are required for email invites — set in repo-root .env",
    );
  }
  return {
    host,
    port,
    user: env.SMTP_USER?.trim() ?? "",
    password: env.SMTP_PASSWORD?.trim() ?? "",
    from,
  };
}

function inviteEmailHtml(bodyText: string, inviteUrl: string, imageUrl: string): string {
  const escaped = bodyText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const paragraphs = escaped
    .split("\n")
    .map((line) => (line.trim() ? `<p style="margin:0 0 1rem;line-height:1.6;">${line}</p>` : ""))
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

export async function sendInviteEmail(
  env: NodeJS.ProcessEnv,
  to: string,
  subject: string,
  bodyText: string,
  options: { inviteUrl: string; imageUrl: string },
): Promise<void> {
  const config = readSmtpConfig(env);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
  });

  try {
    await transport.sendMail({
      from: config.from,
      to,
      subject,
      text: bodyText,
      html: inviteEmailHtml(bodyText, options.inviteUrl, options.imageUrl),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EmailSendError(message);
  }
}
