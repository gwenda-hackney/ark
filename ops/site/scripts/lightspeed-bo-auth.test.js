import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_CAPTCHA,
  AUTH_PASSWORD,
  AUTH_SSO,
  AUTH_TOTP,
  AUTH_UNKNOWN,
  classifyBackOfficeAuthPage,
  pageHasTurnstile,
} from "./lightspeed-bo-auth.js";

describe("classifyBackOfficeAuthPage", () => {
  it("detects email and password", () => {
    assert.equal(
      classifyBackOfficeAuthPage("Email Password Login Forgot password?"),
      AUTH_PASSWORD,
    );
  });

  it("treats SSO-only as blocked", () => {
    assert.equal(
      classifyBackOfficeAuthPage("Log in with Enterprise SSO"),
      AUTH_SSO,
    );
  });

  it("keeps password login when SSO is only an alternate button", () => {
    assert.equal(
      classifyBackOfficeAuthPage(
        "Email Password Login Log in with Enterprise SSO",
      ),
      AUTH_PASSWORD,
    );
  });

  it("detects authenticator 2FA after password", () => {
    assert.equal(
      classifyBackOfficeAuthPage("Enter the authenticator verification code"),
      AUTH_TOTP,
    );
  });

  it("detects a captcha wall", () => {
    assert.equal(
      classifyBackOfficeAuthPage("I'm not a robot hCaptcha"),
      AUTH_CAPTCHA,
    );
  });

  it("flags Turnstile beside a password form without treating it as SSO", () => {
    assert.equal(pageHasTurnstile("Verify you are human cf-turnstile"), true);
    assert.equal(
      classifyBackOfficeAuthPage(
        "Username Password Login Log in with Enterprise SSO",
      ),
      AUTH_PASSWORD,
    );
  });

  it("returns unknown for empty chrome", () => {
    assert.equal(classifyBackOfficeAuthPage("Lightspeed Restaurant"), AUTH_UNKNOWN);
  });
});
