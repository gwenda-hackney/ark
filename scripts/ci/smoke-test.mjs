/**
 * Post-deploy smoke test — page load, critical assets, and runtime APIs.
 *
 * Usage:
 *   node scripts/ci/smoke-test.mjs --url https://staging.gwenda.co.uk --expected-version 2026.06.11+abc1234
 *   SMOKE_TEST_GATE_BYPASS_KEY=... node scripts/ci/smoke-test.mjs --url https://staging.gwenda.co.uk ...
 */
import {
  assertHomePageHealthy,
  collectSameOriginAssetPaths,
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

async function checkPath(path, { expectVersionHeader = path === "/", cookie = "" } = {}) {
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
  if (!data.csrfToken || !data.secret) {
    throw new Error(`${url} missing csrfToken or secret in response`);
  }
  console.log(`OK ${url} (200, subscribe tokens issued)`);
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
  const homeRes = await checkPath("/", { cookie });
  const html = await homeRes.text();
  assertHomePageHealthy(html);
  console.log("OK homepage content checks passed");

  await checkSubscribeApi(cookie);
  await checkCriticalAssets(html, cookie);
  await checkPath("/robots.txt", { expectVersionHeader: false, cookie });
}

const maxAttempts = retries + 1;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await runChecks();
    console.log(`Smoke test passed for ${baseUrl}`);
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
