import { describe, expect, it, vi } from "vitest";
import { checkEmail, runDeepHealth } from "./deep-health.js";

const gmailEnv = {
  GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "service_account", client_email: "a@b", private_key: "k" }),
  SMTP_USER: "notifications@gwenda.co.uk",
};

describe("runDeepHealth", () => {
  it("reports every check, and is not ok if any fails", async () => {
    const result = await runDeepHealth(gmailEnv, {
      checks: {
        good: async () => "fine",
        bad: async () => {
          throw new Error("token expired");
        },
      },
      emailDeps: { token: async () => "t" },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.map((row) => [row.name, row.ok])).toEqual([
      ["good", true],
      ["bad", false],
      ["email", true],
    ]);
    expect(result.checks[1].error).toBe("token expired");
  });
});

describe("checkEmail", () => {
  it("only logs in unless asked to send", async () => {
    const send = vi.fn();
    const detail = await checkEmail(gmailEnv, { deps: { token: async () => "t", send } });
    expect(detail).toMatch(/no email sent/);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the test email to the alert address, not the form inbox", async () => {
    const send = vi.fn(async () => ({ id: "1" }));
    await checkEmail(gmailEnv, { send: true, label: "gwenda.co.uk 2026.09.25", deps: { send } });
    const [, mail] = send.mock.calls[0];
    expect(mail.to).toBe("alerts@gwenda.co.uk");
    expect(mail.from).toBe("notifications@gwenda.co.uk");
    expect(mail.subject).toContain("gwenda.co.uk 2026.09.25");
  });

  it("fails clearly when Gmail isn't configured", async () => {
    await expect(checkEmail({}, {})).rejects.toThrow("Gmail is not configured.");
  });
});
