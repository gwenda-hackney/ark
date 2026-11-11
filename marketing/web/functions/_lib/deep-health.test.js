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
  const emailDeps = { token: async () => "t" };

  it("runs every form and the sign-up end to end", async () => {
    const formSmoke = vi.fn(async (_env, { slug }) => `${slug} ok`);
    const signupSmoke = vi.fn(async () => "signup ok");
    const result = await runDeepHealth(gmailEnv, {
      formTest: true,
      requestUrl: "https://gwenda.co.uk/api/health/deep",
      checks: {},
      emailDeps,
      formSmoke,
      signupSmoke,
    });
    expect(result.checks.map((row) => [row.name, row.detail])).toEqual([
      ["email", "Gmail login works (no email sent)"],
      ["form:play", "play ok"],
      ["form:party", "party ok"],
      ["signup", "signup ok"],
    ]);
    expect(formSmoke.mock.calls.map(([, options]) => options)).toEqual([
      {
        slug: "play",
        createdBy: undefined,
        requestUrl: "https://gwenda.co.uk/api/health/deep",
      },
      {
        slug: "party",
        createdBy: "2026-11-11-party-form.mjs",
        requestUrl: "https://gwenda.co.uk/api/health/deep",
      },
    ]);
    const plain = await runDeepHealth(gmailEnv, {
      checks: {},
      emailDeps,
      formSmoke,
      signupSmoke,
    });
    expect(plain.checks.map((row) => row.name)).toEqual(["email"]);
    expect(signupSmoke).toHaveBeenCalledTimes(1);
  });

  it("passes with a form still waiting for its migration, and says which", async () => {
    const result = await runDeepHealth(gmailEnv, {
      formTest: true,
      checks: {},
      emailDeps,
      formSmoke: async (_env, { slug }) =>
        slug === "party"
          ? { pending: true, form: slug, detail: "not here yet" }
          : "ok",
      signupSmoke: async () => "signup ok",
    });
    expect(result.ok).toBe(true);
    expect(result.checks[2]).toMatchObject({
      name: "form:party",
      ok: true,
      pending: true,
      form: "party",
      detail: "not here yet",
    });
    expect(result.checks[1].pending).toBeUndefined();
  });

  it("fails when one form fails, and still reports the other", async () => {
    const result = await runDeepHealth(gmailEnv, {
      formTest: true,
      checks: {},
      emailDeps,
      formSmoke: async (_env, { slug }) => {
        if (slug === "party") throw new Error("Team email failed: denied");
        return "ok";
      },
      signupSmoke: async () => "signup ok",
    });
    expect(result.ok).toBe(false);
    expect(result.checks.map((row) => [row.name, row.ok])).toEqual([
      ["email", true],
      ["form:play", true],
      ["form:party", false],
      ["signup", true],
    ]);
  });

  it("after the migrations: only the forms asked for, which must exist, and no sign-up", async () => {
    const formSmoke = vi.fn(async () => "ok");
    const signupSmoke = vi.fn();
    const result = await runDeepHealth(gmailEnv, {
      formTest: true,
      forms: ["party"],
      requestUrl: "https://gwenda.co.uk/api/health/deep",
      checks: {},
      emailDeps,
      formSmoke,
      signupSmoke,
    });
    expect(result.checks.map((row) => row.name)).toEqual([
      "email",
      "form:party",
    ]);
    // No createdBy: a form still missing now is a failure, not a wait.
    expect(formSmoke.mock.calls[0][1]).toEqual({
      slug: "party",
      requestUrl: "https://gwenda.co.uk/api/health/deep",
    });
    expect(signupSmoke).not.toHaveBeenCalled();
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
