import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFormEditToken,
  createFormResendToken,
  createFormVerifyToken,
  parseFormEditToken,
  parseFormVerifyToken,
  verifyFormResendToken,
  buildFormEditUrl,
  FORM_VERIFY_TTL_MS,
} from "./form-verify-auth.js";

const env = { SUBSCRIBE_SECRET: "test-secret-for-forms" };

describe("form verify tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a valid token", async () => {
    const token = await createFormVerifyToken(env, {
      rowId: "501",
      email: "Alex@Example.com",
      slug: "play",
    });
    expect(token).toBeTruthy();

    const parsed = await parseFormVerifyToken(env, token);
    expect(parsed).toEqual({
      ok: true,
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
  });

  it("rejects expired tokens", async () => {
    vi.useFakeTimers();
    const token = await createFormVerifyToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
      exp: Date.now() + 1000,
    });
    vi.advanceTimersByTime(FORM_VERIFY_TTL_MS);
    const parsed = await parseFormVerifyToken(env, token);
    expect(parsed).toEqual({
      ok: false,
      reason: "expired",
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
  });

  it("rejects tampered tokens", async () => {
    const token = await createFormVerifyToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
    const [payload] = token.split(".");
    const parsed = await parseFormVerifyToken(env, `${payload}.not-a-real-sig`);
    expect(parsed.ok).toBe(false);
  });

  it("verifies resend tokens", async () => {
    const token = await createFormResendToken(env, {
      rowId: "501",
      slug: "play",
    });
    expect(
      await verifyFormResendToken(env, {
        rowId: "501",
        slug: "play",
        token,
      }),
    ).toBe(true);
    expect(
      await verifyFormResendToken(env, {
        rowId: "502",
        slug: "play",
        token,
      }),
    ).toBe(false);
  });
});

describe("form edit tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips without expiry", async () => {
    const token = await createFormEditToken(env, {
      rowId: "501",
      email: "Alex@Example.com",
      slug: "play",
    });
    expect(token).toBeTruthy();

    const parsed = await parseFormEditToken(env, token);
    expect(parsed).toEqual({
      ok: true,
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
  });

  it("still validates after a long delay (no TTL)", async () => {
    vi.useFakeTimers();
    const token = await createFormEditToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
    vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 400);
    const parsed = await parseFormEditToken(env, token);
    expect(parsed.ok).toBe(true);
  });

  it("rejects tampered tokens", async () => {
    const token = await createFormEditToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
    const [payload] = token.split(".");
    const parsed = await parseFormEditToken(env, `${payload}.not-a-real-sig`);
    expect(parsed).toEqual({ ok: false, reason: "invalid" });
  });

  it("builds a /contact/edit URL", async () => {
    const token = await createFormEditToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
    const url = await buildFormEditUrl(
      "http://localhost:4321/api/forms",
      { ...env, SITE_ENV: "local" },
      token,
    );
    expect(url).toMatch(/^http:\/\/localhost:4321\/contact\/edit\?t=/);
  });
});
