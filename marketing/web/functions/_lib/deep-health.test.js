import { describe, expect, it, vi } from "vitest";
import { checkEmail, runDeepHealth } from "./deep-health.js";

const gmailEnv = {
  GMAIL_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "a@b",
    private_key: "k",
  }),
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

describe("runDeepHealth with formTest", () => {
  it("runs the play form and the sign-up end to end", async () => {
    const formSmoke = vi.fn(async () => "form ok");
    const signupSmoke = vi.fn(async () => "signup ok");
    const result = await runDeepHealth(gmailEnv, {
      formTest: true,
      checks: {},
      emailDeps: { token: async () => "t" },
      formSmoke,
      signupSmoke,
    });
    expect(result.checks.map((row) => [row.name, row.detail])).toEqual([
      ["email", "Gmail login works (no email sent)"],
      ["form", "form ok"],
      ["signup", "signup ok"],
    ]);
    const plain = await runDeepHealth(gmailEnv, {
      checks: {},
      emailDeps: { token: async () => "t" },
      signupSmoke,
    });
    expect(plain.checks.map((row) => row.name)).toEqual(["email"]);
    expect(signupSmoke).toHaveBeenCalledTimes(1);
  });
});

describe("checkEmail", () => {
  it("only logs in unless asked to send", async () => {
    const send = vi.fn();
    const detail = await checkEmail(gmailEnv, {
      deps: { token: async () => "t", send },
    });
    expect(detail).toMatch(/no email sent/);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the test email to the alert address, not the form inbox", async () => {
    const send = vi.fn(async () => ({ id: "1" }));
    await checkEmail(gmailEnv, {
      send: true,
      label: "gwenda.co.uk 2026.09.25",
      deps: { send },
    });
    const [, mail] = send.mock.calls[0];
    expect(mail.to).toBe("alerts@gwenda.co.uk");
    expect(mail.from).toBe("Gwenda <notifications@gwenda.co.uk>");
    expect(mail.subject).toContain("gwenda.co.uk 2026.09.25");
  });

  it("fails clearly when Gmail isn't configured", async () => {
    await expect(checkEmail({}, {})).rejects.toThrow(
      "Gmail is not configured.",
    );
  });
});

describe("CHECKS", () => {
  it("checks every D1 database the site binds", async () => {
    const { CHECKS } = await import("./deep-health.js");
    expect(
      Object.keys(CHECKS).filter((name) => name.startsWith("d1:")),
    ).toEqual(["d1:ops", "d1:website", "d1:config"]);
    await expect(CHECKS["d1:website"]({})).rejects.toThrow("not bound");
  });
});
