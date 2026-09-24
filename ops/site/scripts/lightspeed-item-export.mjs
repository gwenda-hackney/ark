#!/usr/bin/env node
/**
 * Spike / CI: pull the K-Series item list (Menu > Item list > Export formatted CSV).
 *
 * Read-only. Does not stamp SKUs. Optional POST to ops preview only.
 *
 *   npm run lightspeed:export -w @gwenda/ops -- --probe
 *   npm run lightspeed:export -w @gwenda/ops -- --headed --repeat 2
 *   npm run lightspeed:export -w @gwenda/ops -- --check-file path.csv
 *
 * Env (from .env.ops / GitHub / SM):
 *   LIGHTSPEED_BO_EMAIL
 *   LIGHTSPEED_BO_PASSWORD
 *   LIGHTSPEED_BO_TOTP          optional base32 secret
 *   LIGHTSPEED_BO_URL           default https://manager.lsk.lightspeed.app/
 *   LIGHTSPEED_BO_LOCATION      optional business-location label
 *   LIGHTSPEED_HEADED=1         watch the browser
 *   LIGHTSPEED_OPS_PREVIEW_URL  default https://gwenda-ops.pages.dev
 *   LIGHTSPEED_OPS_EMAIL        ops Users email for preview POST
 *   OPS_SESSION_SECRET          mint a short-lived ops cookie for preview POST
 */
import { createHmac } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTH_CAPTCHA,
  AUTH_PASSWORD,
  AUTH_SSO,
  AUTH_TOTP,
  EXIT_AUTH_BLOCKED,
  EXIT_MISSING_CREDS,
  authBlockedMessage,
  pageHasTurnstile,
  classifyBackOfficeAuthPage,
} from "./lightspeed-bo-auth.js";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
} from "../functions/_lib/auth.js";
import {
  assertLightspeedFormattedExport,
  missingLightspeedItemHeaders,
} from "../functions/_lib/lightspeed-stock.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BO_URL = "https://manager.lsk.lightspeed.app/";
const DEFAULT_PREVIEW_URL = "https://gwenda-ops.pages.dev";
const DEFAULT_OUT_DIR = join(scriptDir, ".lightspeed-export");

export function parseArgs(argv) {
  const out = {
    probe: false,
    headed: false,
    repeat: 1,
    checkFile: "",
    out: "",
    preview: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--probe") out.probe = true;
    else if (arg === "--headed") out.headed = true;
    else if (arg === "--preview") out.preview = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--repeat") {
      out.repeat = Math.max(1, Number(argv[i + 1]) || 1);
      i += 1;
    } else if (arg.startsWith("--repeat=")) {
      out.repeat = Math.max(1, Number(arg.slice("--repeat=".length)) || 1);
    } else if (arg === "--check-file") {
      out.checkFile = String(argv[i + 1] || "");
      i += 1;
    } else if (arg.startsWith("--check-file=")) {
      out.checkFile = arg.slice("--check-file=".length);
    } else if (arg === "--out") {
      out.out = String(argv[i + 1] || "");
      i += 1;
    } else if (arg.startsWith("--out=")) {
      out.out = arg.slice("--out=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

export function decodeBase32(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(secret || "")
    .replace(/\s+/g, "")
    .replace(/=+$/, "")
    .toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totpCode(secret, { now = Date.now(), period = 30, digits = 6 } = {}) {
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

function helpText() {
  return `Pull the Lightspeed K-Series formatted item-list CSV (read-only).

Usage:
  node ops/site/scripts/lightspeed-item-export.mjs [--probe] [--headed] [--repeat 2]
  node ops/site/scripts/lightspeed-item-export.mjs --check-file file.csv
  node ops/site/scripts/lightspeed-item-export.mjs --preview

Exit 2 means 2FA/SSO/captcha blocked unattended login. Paid Items GET is the fallback.
Exit 3 means LIGHTSPEED_BO_EMAIL / LIGHTSPEED_BO_PASSWORD are missing.`;
}

async function pageText(page) {
  try {
    return (await page.locator("body").innerText({ timeout: 5000 })).slice(0, 8000);
  } catch {
    return "";
  }
}

async function saveFailure(page, dir, name) {
  try {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name), fullPage: true });
  } catch {
    // ignore screenshot failures
  }
}

async function clickFirst(page, locators, timeout = 8000) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const target = locator.first();
    try {
      await target.waitFor({ state: "visible", timeout });
      await target.click({ timeout });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function fillFirst(page, locators, value, timeout = 8000) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const target = locator.first();
    try {
      await target.waitFor({ state: "visible", timeout });
      await target.fill(value, { timeout });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function waitForLoginButton(page, timeoutMs = 20000) {
  const button = page.getByRole("button", { name: /^(log in|login)$/i }).first();
  await button.waitFor({ state: "visible", timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await button.isEnabled()) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function loginBackOffice(page, env) {
  const email = env.LIGHTSPEED_BO_EMAIL?.trim() || "";
  const password = env.LIGHTSPEED_BO_PASSWORD || "";
  const totpSecret = env.LIGHTSPEED_BO_TOTP?.trim() || "";
  await fillFirst(page, [
    page.getByLabel(/email|username|e-mail/i),
    page.locator('input[type="email"]'),
    page.locator('input[name="username"]'),
    page.locator('input[name="email"]'),
    page.getByPlaceholder(/email|username/i),
  ], email);
  await fillFirst(page, [
    page.getByLabel(/^password$/i),
    page.locator('input[type="password"]'),
    page.getByPlaceholder(/password/i),
  ], password);
  const submitted = await clickFirst(page, [
    page.getByRole("button", { name: /^(log in|login|sign in)$/i }),
    page.locator('button[type="submit"]'),
  ]);
  if (!submitted) {
    throw new Error("Could not find the Back Office login button.");
  }

  await page.waitForTimeout(1500);
  let kind = classifyBackOfficeAuthPage(await pageText(page));
  if (kind === AUTH_TOTP) {
    if (!totpSecret) {
      const error = new Error(authBlockedMessage(AUTH_TOTP));
      error.exitCode = EXIT_AUTH_BLOCKED;
      throw error;
    }
    const filled = await fillFirst(page, [
      page.getByLabel(/code|authenticator|verification|otp/i),
      page.locator('input[name*="otp" i]'),
      page.locator('input[name*="code" i]'),
      page.locator('input[type="tel"]'),
    ], totpCode(totpSecret));
    if (!filled) {
      const error = new Error(authBlockedMessage(AUTH_TOTP));
      error.exitCode = EXIT_AUTH_BLOCKED;
      throw error;
    }
    await clickFirst(page, [
      page.getByRole("button", { name: /^(verify|continue|log in|login|submit)$/i }),
      page.locator('button[type="submit"]'),
    ]);
    await page.waitForTimeout(1500);
    kind = classifyBackOfficeAuthPage(await pageText(page));
  }
  if (kind === AUTH_SSO || kind === AUTH_CAPTCHA) {
    const error = new Error(authBlockedMessage(kind));
    error.exitCode = EXIT_AUTH_BLOCKED;
    throw error;
  }

  const location = env.LIGHTSPEED_BO_LOCATION?.trim() || "";
  if (location) {
    await clickFirst(page, [
      page.getByRole("button", { name: new RegExp(location, "i") }),
      page.getByText(new RegExp(location, "i")),
    ], 4000);
  } else {
    await clickFirst(page, [
      page.getByRole("button", { name: /continue|select|open/i }),
    ], 2500);
  }
}

async function exportItemListCsv(page) {
  const openedMenu = await clickFirst(page, [
    page.getByRole("link", { name: /^menu$/i }),
    page.getByRole("menuitem", { name: /^menu$/i }),
    page.getByRole("button", { name: /^menu$/i }),
    page.getByText(/^menu$/i),
  ], 20000);
  if (!openedMenu) {
    throw new Error("Could not open Menu in Back Office.");
  }
  const openedList = await clickFirst(page, [
    page.getByRole("link", { name: /item list/i }),
    page.getByRole("menuitem", { name: /item list/i }),
    page.getByText(/item list/i),
  ], 15000);
  if (!openedList) {
    throw new Error("Could not open Item list.");
  }
  await page.waitForTimeout(1000);
  const openedExport = await clickFirst(page, [
    page.getByRole("button", { name: /^export$/i }),
    page.getByRole("link", { name: /^export$/i }),
    page.getByText(/^export$/i),
  ]);
  if (!openedExport) {
    throw new Error("Could not open the item-list Export dialog.");
  }
  await clickFirst(page, [
    page.getByText(/lightspeed formatted/i),
    page.getByRole("radio", { name: /lightspeed formatted/i }),
    page.getByLabel(/lightspeed formatted/i),
  ], 8000);
  await clickFirst(page, [
    page.getByText(/csv for mac/i),
    page.getByRole("radio", { name: /csv for mac/i }),
    page.getByLabel(/csv for mac/i),
    page.getByText(/^csv$/i),
  ], 5000);

  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  const clicked = await clickFirst(page, [
    page.getByRole("button", { name: /^export$/i }),
    page.getByRole("button", { name: /download/i }),
  ]);
  if (!clicked) {
    throw new Error("Could not confirm Export in the dialog.");
  }
  const download = await downloadPromise;
  const failure = await download.failure();
  if (failure) throw new Error(`Download failed: ${failure}`);
  const path = await download.path();
  if (!path) throw new Error("Download had no local path.");
  return readFileSync(path);
}

export async function postLightspeedPreview({
  previewUrl,
  sessionSecret,
  email,
  text,
  fetchImpl = fetch,
}) {
  const token = await createSessionToken(sessionSecret, email, 60 * 60);
  if (!token) {
    throw new Error("Could not mint an ops session cookie for preview.");
  }
  const url = new URL("/api/inventory/lightspeed", previewUrl);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${AUTH_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify({ action: "preview", text }),
  });
  const body = await response.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = json?.error || body.slice(0, 300) || `HTTP ${response.status}`;
    throw new Error(`Ops preview failed (${response.status}): ${message}`);
  }
  return json;
}

async function launchBrowser(headed) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. From the repo root run: npm install -w @gwenda/ops",
    );
  }
  return playwright.chromium.launch({ headless: !headed });
}

async function probeLogin(env, opts) {
  const url = env.LIGHTSPEED_BO_URL?.trim() || DEFAULT_BO_URL;
  const outDir = dirname(opts.out || join(DEFAULT_OUT_DIR, "probe.png"));
  const browser = await launchBrowser(opts.headed);
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const ready = await waitForLoginButton(page, 20000);
    const text = await pageText(page);
    const kind = classifyBackOfficeAuthPage(text);
    await saveFailure(page, outDir, "probe.png");
    console.log(`Back Office login at ${url}`);
    console.log(`Auth page: ${kind}`);
    console.log(`Log in enabled: ${ready}`);
    if (pageHasTurnstile(text) || !ready) {
      console.log(
        "Cloudflare Turnstile is on this form. GitHub-hosted runners may fail it. Prefer a nest run.",
      );
    }
    if (!ready) {
      console.error(authBlockedMessage(AUTH_CAPTCHA));
      return EXIT_AUTH_BLOCKED;
    }
    if (kind === AUTH_SSO || kind === AUTH_CAPTCHA) {
      console.error(authBlockedMessage(kind));
      return EXIT_AUTH_BLOCKED;
    }
    if (kind === AUTH_TOTP) {
      console.error(authBlockedMessage(AUTH_TOTP));
      return EXIT_AUTH_BLOCKED;
    }
    if (kind !== AUTH_PASSWORD) {
      console.error(
        "Could not confirm email/password login. Screenshot: probe.png. Treat as no-go until a dedicated user is tried.",
      );
      return EXIT_AUTH_BLOCKED;
    }
    console.log("Password form is present. Dedicated user + LIGHTSPEED_BO_* can try --repeat 2 next.");
    return 0;
  } finally {
    await browser.close();
  }
}

async function exportOnce(env, opts, index) {
  const url = env.LIGHTSPEED_BO_URL?.trim() || DEFAULT_BO_URL;
  const outDir = DEFAULT_OUT_DIR;
  mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser(opts.headed);
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const ready = await waitForLoginButton(page, 20000);
    if (!ready) {
      const error = new Error(authBlockedMessage(AUTH_CAPTCHA));
      error.exitCode = EXIT_AUTH_BLOCKED;
      throw error;
    }
    const kind = classifyBackOfficeAuthPage(await pageText(page));
    if (kind === AUTH_SSO || kind === AUTH_CAPTCHA) {
      const error = new Error(authBlockedMessage(kind));
      error.exitCode = EXIT_AUTH_BLOCKED;
      throw error;
    }
    await loginBackOffice(page, env);
    const bytes = await exportItemListCsv(page);
    const text = bytes.toString("utf8");
    const rows = assertLightspeedFormattedExport(text);
    const outPath =
      opts.out ||
      join(outDir, index > 1 ? `item-list-${index}.csv` : "item-list.csv");
    const dest = isAbsolute(outPath) ? outPath : resolve(process.cwd(), outPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text);
    console.log(`Export ${index}: ${rows.length} rows → ${dest}`);
    return text;
  } catch (error) {
    await saveFailure(page, outDir, `failure-${index}.png`);
    throw error;
  } finally {
    await browser.close();
  }
}

async function maybePreview(env, text, enabled) {
  if (!enabled) return;
  const previewUrl =
    env.LIGHTSPEED_OPS_PREVIEW_URL?.trim() || DEFAULT_PREVIEW_URL;
  const email = env.LIGHTSPEED_OPS_EMAIL?.trim() || "";
  const sessionSecret = env.OPS_SESSION_SECRET?.trim() || "";
  if (!email || !sessionSecret) {
    console.log(
      "Skip ops preview POST (need LIGHTSPEED_OPS_EMAIL and OPS_SESSION_SECRET).",
    );
    return;
  }
  const json = await postLightspeedPreview({
    previewUrl,
    sessionSecret,
    email,
    text,
  });
  const matched = json?.matched?.length ?? 0;
  const opsOnly = json?.opsOnly?.length ?? 0;
  const lightspeedOnly = json?.lightspeedOnly?.length ?? 0;
  console.log(
    `Ops preview (no stamp): matched=${matched} opsOnly=${opsOnly} lightspeedOnly=${lightspeedOnly}`,
  );
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(helpText());
    process.exit(1);
  }
  if (opts.help) {
    console.log(helpText());
    return;
  }
  if (process.env.LIGHTSPEED_HEADED === "1") opts.headed = true;
  if (process.env.LIGHTSPEED_PREVIEW === "1") opts.preview = true;

  if (opts.checkFile) {
    const text = readFileSync(opts.checkFile, "utf8");
    const rows = assertLightspeedFormattedExport(text);
    console.log(
      `OK formatted export: ${rows.length} rows, missing columns: none.`,
    );
    await maybePreview(process.env, text, opts.preview);
    return;
  }

  if (opts.probe) {
    const code = await probeLogin(process.env, opts);
    process.exit(code);
  }

  const email = process.env.LIGHTSPEED_BO_EMAIL?.trim() || "";
  const password = process.env.LIGHTSPEED_BO_PASSWORD || "";
  if (!email || !password) {
    console.error(
      "Set LIGHTSPEED_BO_EMAIL and LIGHTSPEED_BO_PASSWORD (dedicated Back Office user, not the owner login).",
    );
    process.exit(EXIT_MISSING_CREDS);
  }

  let lastText = "";
  for (let i = 1; i <= opts.repeat; i += 1) {
    lastText = await exportOnce(process.env, opts, i);
  }
  const missing = missingLightspeedItemHeaders(lastText);
  if (missing.length) {
    throw new Error(`Missing columns: ${missing.join(", ")}`);
  }
  console.log(`OK ${opts.repeat} formatted export(s).`);
  await maybePreview(process.env, lastText, opts.preview);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    const code = Number(error?.exitCode) || 1;
    console.error(error.message || error);
    process.exit(code);
  });
}
