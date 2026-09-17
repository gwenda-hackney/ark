import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFormResendToken,
  createFormVerifyToken,
  parseFormVerifyToken,
  verifyFormResendToken,
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
      slug: "play-at-gwenda",
    });
    expect(token).toBeTruthy();

    const parsed = await parseFormVerifyToken(env, token);
    expect(parsed).toEqual({
      ok: true,
      rowId: "501",
      email: "alex@example.com",
      slug: "play-at-gwenda",
    });
  });

  it("rejects expired tokens", async () => {
    vi.useFakeTimers();
    const token = await createFormVerifyToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play-at-gwenda",
      exp: Date.now() + 1000,
    });
    vi.advanceTimersByTime(FORM_VERIFY_TTL_MS);
    const parsed = await parseFormVerifyToken(env, token);
    expect(parsed).toEqual({
      ok: false,
      reason: "expired",
      rowId: "501",
      email: "alex@example.com",
      slug: "play-at-gwenda",
    });
  });

  it("rejects tampered tokens", async () => {
    const token = await createFormVerifyToken(env, {
      rowId: "501",
      email: "alex@example.com",
      slug: "play-at-gwenda",
    });
    const [payload] = token.split(".");
    const parsed = await parseFormVerifyToken(env, `${payload}.not-a-real-sig`);
    expect(parsed.ok).toBe(false);
  });

  it("verifies resend tokens", async () => {
    const token = await createFormResendToken(env, {
      rowId: "501",
      slug: "play-at-gwenda",
    });
    expect(
      await verifyFormResendToken(env, {
        rowId: "501",
        slug: "play-at-gwenda",
        token,
      }),
    ).toBe(true);
    expect(
      await verifyFormResendToken(env, {
        rowId: "502",
        slug: "play-at-gwenda",
        token,
      }),
    ).toBe(false);
  });
});
