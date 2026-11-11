/**
 * Post-deploy smoke test — page load, critical assets, and runtime APIs.
 *
 * Usage:
 *   node scripts/ci/smoke-test.mjs --url https://preview.gwenda-blue.pages.dev --expected-version 2026.06.11+abc1234
 *   SMOKE_TEST_GATE_BYPASS_KEY=... node scripts/ci/smoke-test.mjs --url https://preview.gwenda-blue.pages.dev ...
 *
 *   --deep           also POST /api/health/deep (Bearer DEPLOY_WEBHOOK_SECRET): Sanity,
 *                    both Baserow databases, config DB, the three D1 databases
 *                    (migrated, a test row written and deleted) and Gmail login
 *   --send-email     with --deep, send a test email to alerts@gwenda.co.uk
 *   --form-test      with --deep, submit every form the site tests (SMOKE_FORMS in
 *                    functions/_lib/form-smoke.js: play, party) end to end: row saved,
 *                    team and applicant emails to alerts@ (not the form's inbox), row
 *                    deleted afterwards; and sign up a test address twice (tags
 *                    merged), row deleted. A form that a post-deploy migration has
 *                    yet to make is reported as WAIT and listed in the step output
 *                    `forms-pending`
 *   --forms a,b      with --form-test, submit only these forms, which must exist, and
 *                    skip the sign-up: for the forms left waiting, once the
 *                    post-deploy migrations have run
 */
import { appendFileSync } from "node:fs";
import {
  assertHealthPayload,
  assertHomePageHealthy,
  assertNotFoundPage,
  assertPicturesSized,
  assertSubscribeTokens,
  collectSameOriginAssetPaths,
  deepCheckLine,
  iconPaths,
  manifestPath,
  parseFormsArg,
  pendingForms,
} from "./smoke-test-lib.mjs";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const baseUrl = (getArg("--url") || process.env.SMOKE_TEST_URL || "").replace(
  /\/$/,
  "",
);
const expectedVersion =
  getArg("--expected-version") || process.env.SMOKE_TEST_EXPECTED_VERSION || "";
const deep = args.includes("--deep");
const sendEmail = args.includes("--send-email");
const formTest = args.includes("--form-test");
const onlyForms = parseFormsArg(getArg("--forms"));
const gateBypassKey =
  getArg("--gate-bypass-key") || process.env.SMOKE_TEST_GATE_BYPASS_KEY || "";
const retries = Number(
  getArg("--retries") ?? process.env.SMOKE_TEST_RETRIES ?? "0",
);
const retryDelayMs = Number(
  getArg("--retry-delay-ms") ?? process.env.SMOKE_TEST_RETRY_DELAY_MS ?? "5000",
);

if (!baseUrl) {
  console.error(
    "Usage: smoke-test.mjs --url https://example.pages.dev [--expected-version YYYY.MM.DD+sha] [--gate-bypass-key KEY]",
  );
  process.exit(1);
}

function errorDetail(err) {
  return err.cause?.message || err.message || String(err);
}

/** @param {Headers} headers */
function cookieHeaderFromSetCookie(headers) {
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
  return raw.map((part) => part.split(";")[0].trim()).join("; ");
}

async function gateBypassCookie() {
  if (!gateBypassKey) return "";

  const url = new URL(baseUrl);
  url.searchParams.set("access", gateBypassKey);
  const res = await fetch(url.toString(), { redirect: "manual" });
  if (res.status !== 302 && res.status !== 301) {
    throw new Error(
      `Gate bypass at ${url} expected redirect, got ${res.status}`,
    );
  }
  const cookie = cookieHeaderFromSetCookie(res.headers);
  if (!cookie.includes("gwenda_access=")) {
    throw new Error("Gate bypass did not set gwenda_access cookie");
  }
  return cookie;
}

function fetchInit(cookie) {
  return cookie ? { headers: { Cookie: cookie } } : {};
}

async function fetchChecked(url, init = {}) {
  const res = await fetch(url, { redirect: "follow", ...init });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  return res;
}

async function checkPath(
  path,
  { expectVersionHeader = path === "/", cookie = "" } = {},
) {
  const url = `${baseUrl}${path}`;
  const res = await fetchChecked(url, fetchInit(cookie));
  const version = res.headers.get("x-gwenda-version");
  if (expectVersionHeader && !version) {
    throw new Error(`${url} missing X-Gwenda-Version header`);
  }
  if (expectVersionHeader && expectedVersion && version !== expectedVersion) {
    throw new Error(
      `${url} X-Gwenda-Version mismatch: expected ${expectedVersion}, got ${version}`,
    );
  }
  const versionNote =
    expectVersionHeader && version ? `, X-Gwenda-Version: ${version}` : "";
  console.log(`OK ${url} (${res.status}${versionNote})`);
  return res;
}

async function checkHealth() {
  const url = `${baseUrl}/health`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error(`${url} expected application/json, got ${type}`);
  }
  const data = await res.json();
  assertHealthPayload(data);
  console.log(`OK ${url} (200, service=${data.service})`);
}

async function checkSubscribeApi(cookie = "") {
  const url = `${baseUrl}/api/subscribe`;
  const res = await fetch(url, fetchInit(cookie));
  if (res.status !== 200) {
    throw new Error(`${url} returned ${res.status}`);
  }
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error(`${url} expected application/json, got ${type}`);
  }
  const data = await res.json();
  try {
    assertSubscribeTokens(data);
  } catch (error) {
    throw new Error(`${url} ${error.message}`);
  }
  console.log(`OK ${url} (200, CSRF token issued)`);
}

async function checkRsvpApi(cookie = "") {
  const url = new URL(`${baseUrl}/api/rsvp`);
  url.searchParams.set("slug", "invalid-event-slug");
  url.searchParams.set("event-password", "invalid-word-set-here");
  const res = await fetch(url, fetchInit(cookie));
  if (res.status !== 403 && res.status !== 404) {
    throw new Error(
      `${url} expected 403 or 404 for invalid invite, got ${res.status}`,
    );
  }
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new Error(`${url} expected application/json, got ${type}`);
  }
  const data = await res.json();
  if (!data.error) {
    throw new Error(`${url} missing error message in response`);
  }
  console.log(`OK ${url} (${res.status}, RSVP API returns JSON errors)`);
}

async function checkCriticalAssets(html, cookie = "") {
  const paths = collectSameOriginAssetPaths(html, baseUrl);
  const required = paths.filter(
    (p) =>
      p.startsWith("/_astro/") &&
      (p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".woff2")),
  );

  if (required.length === 0) {
    throw new Error("No /_astro/ JS or CSS assets found on homepage");
  }

  const init = fetchInit(cookie);
  for (const path of required.slice(0, 12)) {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, init);
    if (!res.ok) {
      throw new Error(`Critical asset ${url} returned ${res.status}`);
    }
    console.log(`OK ${url} (${res.status})`);
  }
}

async function runChecks() {
  const cookie = await gateBypassCookie();
  await checkHealth();
  const homeRes = await checkPath("/", { cookie });
  const html = await homeRes.text();
  assertHomePageHealthy(html);
  console.log("OK homepage content checks passed");

  // No flyer downloads bigger than it shows, on home or What's on (#240).
  assertPicturesSized(html, "/");
  const whatsOn = await checkPath("/whats-on", { cookie });
  assertPicturesSized(await whatsOn.text(), "/whats-on");
  console.log("OK flyers are offered at the sizes they show");

  await checkSubscribeApi(cookie);
  await checkRsvpApi(cookie);
  await checkCriticalAssets(html, cookie);
  await checkPath("/robots.txt", { expectVersionHeader: false, cookie });
  await checkNotFound(cookie);
  await checkIcons(html, cookie);
  await checkPath("/brand/logo-organization.png", {
    expectVersionHeader: false,
    cookie,
  });
}

/**
 * A wrong address gets the "Nothing here" page and a 404 (#240), not home
 * with a 200; one under What's on too, where a Pages Function answers first.
 */
async function checkNotFound(cookie) {
  for (const path of [
    "/smoke-test-no-such-page",
    "/whats-on/smoke-test-no-such-night",
  ]) {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, { ...fetchInit(cookie), redirect: "manual" });
    assertNotFoundPage({
      path: url,
      status: res.status,
      html: await res.text(),
    });
    console.log(`OK ${url} (404, the "Nothing here" page)`);
  }
}

/**
 * Home links the record icon in every form (#240), and each is served as an
 * image: a missing file can come back as a page of HTML with a 200.
 */
async function checkIcons(html, cookie) {
  const paths = iconPaths(html);
  for (const path of [
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
  ]) {
    if (!paths.includes(path)) {
      throw new Error(`Homepage missing icon link ${path}`);
    }
  }
  // The manifest, and the Android home-screen icons it lists
  const manifest = manifestPath(html);
  if (!manifest) throw new Error("Homepage missing the web app manifest link");
  const res = await checkPath(manifest, { expectVersionHeader: false, cookie });
  const listed = ((await res.json()).icons || []).map((icon) => icon.src);
  if (listed.length === 0) throw new Error(`${manifest} lists no icons`);
  for (const path of new Set([...paths, ...listed])) {
    const res = await checkPath(path, { expectVersionHeader: false, cookie });
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      throw new Error(`${baseUrl}${path} expected an image, got ${type}`);
    }
  }
}

/** Every dependency the deployment needs. Runs once, after the page checks pass. */
async function runDeepChecks() {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET?.trim();
  if (!secret)
    throw new Error("--deep needs DEPLOY_WEBHOOK_SECRET in the environment.");
  const label = `${new URL(baseUrl).host}${expectedVersion ? ` ${expectedVersion}` : ""}`;
  const res = await fetch(`${baseUrl}/api/health/deep`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sendEmail,
      formTest,
      ...(onlyForms.length ? { forms: onlyForms } : {}),
      label,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data?.checks) throw new Error(`/api/health/deep returned ${res.status}`);
  for (const check of data.checks) {
    if (check.ok) console.log(deepCheckLine(check));
    else console.error(deepCheckLine(check));
  }
  // Forms still waiting for their migration: the workflow submits them after it.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `forms-pending=${pendingForms(data.checks).join(",")}\n`,
    );
  }
  if (!data.ok)
    throw new Error("Deep health check failed (see FAIL lines above).");
  console.log(`Deep health passed for ${baseUrl}`);
}

const maxAttempts = retries + 1;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await runChecks();
    console.log(`Smoke test passed for ${baseUrl}`);
    if (deep) {
      try {
        await runDeepChecks();
      } catch (err) {
        console.error(`Smoke test failed: ${errorDetail(err)}`);
        process.exit(1);
      }
    }
    process.exit(0);
  } catch (err) {
    if (attempt === maxAttempts) {
      console.error(`Smoke test failed: ${errorDetail(err)}`);
      process.exit(1);
    }
    console.warn(
      `Smoke test attempt ${attempt}/${maxAttempts} failed (${errorDetail(err)}); retrying in ${retryDelayMs}ms...`,
    );
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}
