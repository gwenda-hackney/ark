/**
 * Classify the K-Series Back Office login (or post-login) page from visible text.
 * Used by the export script to stop cleanly on SSO / 2FA we cannot store.
 */

export const AUTH_PASSWORD = "password";
export const AUTH_SSO = "sso";
export const AUTH_TOTP = "totp";
export const AUTH_CAPTCHA = "captcha";
export const AUTH_UNKNOWN = "unknown";

export function classifyBackOfficeAuthPage(text) {
  const raw = String(text || "").toLowerCase();
  const totp =
    /authenticator|verification code|one-time password|\botp\b|two-factor|two factor|\b2fa\b|enter the code|security token/.test(
      raw,
    );
  const sso = /enterprise sso|log in with sso|single sign-on|login with sso/.test(
    raw,
  );
  const password =
    /\bpassword\b/.test(raw) &&
    /\b(email|username|e-mail|user name)\b/.test(raw);
  const captcha =
    /i'm not a robot|hcaptcha|recaptcha|cloudflare.*challenge|cf-turnstile|turnstile|verify you are human/.test(
      raw,
    );

  if (totp) return AUTH_TOTP;
  if (captcha && !password) return AUTH_CAPTCHA;
  if (sso && !password) return AUTH_SSO;
  if (password) return AUTH_PASSWORD;
  if (sso) return AUTH_SSO;
  if (captcha) return AUTH_CAPTCHA;
  return AUTH_UNKNOWN;
}

export function pageHasTurnstile(text) {
  const raw = String(text || "").toLowerCase();
  return /turnstile|verify you are human|cf-turnstile|cloudflare.*challenge/.test(
    raw,
  );
}

export const EXIT_AUTH_BLOCKED = 2;
export const EXIT_MISSING_CREDS = 3;

export function authBlockedMessage(kind) {
  if (kind === AUTH_SSO) {
    return "Back Office login is SSO. Unattended export is a no-go. Use the paid K-Series Items GET instead.";
  }
  if (kind === AUTH_TOTP) {
    return "Back Office asked for 2FA and LIGHTSPEED_BO_TOTP is not set. Unattended export is a no-go. Use the paid K-Series Items GET, or store a TOTP secret for a dedicated export user.";
  }
  if (kind === AUTH_CAPTCHA) {
    return "Back Office login is behind a captcha. Unattended export is a no-go. Use the paid K-Series Items GET instead.";
  }
  return "Back Office login cannot run unattended. Use the paid K-Series Items GET instead.";
}
