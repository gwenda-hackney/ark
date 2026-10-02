import { describe, expect, it, vi } from "vitest";
import {
  formatFormAlertEmail,
  reportFormError,
  shouldSendFormAlert,
} from "../../../../shared/forms/form-alert.js";

const productionEnv = {
  SITE_ENV: "production",
  ALERT_EMAIL: "alerts@gwenda.co.uk",
};

describe("shouldSendFormAlert", () => {
  it("sends only in production", () => {
    expect(shouldSendFormAlert({ SITE_ENV: "dev" }, "form_store_failed")).toBe(
      false,
    );
    expect(shouldSendFormAlert({}, "form_store_failed")).toBe(false);
    expect(shouldSendFormAlert(productionEnv, "form_store_failed")).toBe(true);
  });

  it("does not alert on missing notify address", () => {
    expect(
      shouldSendFormAlert(productionEnv, "form_notify_email_skipped", {
        reason: "missing_notify_email",
      }),
    ).toBe(false);
  });

  it("alerts when email is not configured in production", () => {
    expect(
      shouldSendFormAlert(productionEnv, "form_notify_email_skipped", {
        reason: "email_not_configured",
      }),
    ).toBe(true);
  });
});

describe("formatFormAlertEmail", () => {
  it("builds a plain-text ops mail", () => {
    const mail = formatFormAlertEmail({
      event: "form_store_failed",
      extra: { slug: "play", status: 502 },
    });
    expect(mail.subject).toBe("Gwenda form error · form_store_failed");
    expect(mail.text).toContain("event: form_store_failed");
    expect(mail.text).toContain("slug: play");
    expect(mail.text).toContain("status: 502");
    expect(mail.text).not.toContain("—");
  });
});

describe("reportFormError", () => {
  it("logs and emails in production", async () => {
    const records = [];
    const sendAlertEmail = vi.fn(async () => ({ ok: true }));
    const result = await reportFormError(
      productionEnv,
      "form_store_failed",
      { slug: "play" },
      {
        log: {
          event(_level, event, extra) {
            records.push({ event, extra });
          },
        },
        sendAlertEmail,
      },
    );
    expect(result).toEqual({ logged: true, emailed: true });
    expect(records[0].event).toBe("form_store_failed");
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("logs without emailing locally", async () => {
    const sendAlertEmail = vi.fn(async () => ({ ok: true }));
    const result = await reportFormError(
      { SITE_ENV: "local" },
      "form_store_failed",
      { slug: "play" },
      {
        log: { event() {} },
        sendAlertEmail,
      },
    );
    expect(result).toEqual({ logged: true, emailed: false });
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it("does not throw when the alert send fails", async () => {
    const records = [];
    const result = await reportFormError(
      productionEnv,
      "form_notify_email_failed",
      { error: "smtp down" },
      {
        log: {
          event(_level, event, extra) {
            records.push({ event, extra });
          },
        },
        sendAlertEmail: async () => {
          throw new Error("smtp down");
        },
      },
    );
    expect(result).toEqual({ logged: true, emailed: false });
    expect(records.some((row) => row.event === "form_alert_email_failed")).toBe(
      true,
    );
  });
});
