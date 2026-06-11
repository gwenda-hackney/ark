/**
 * Minimal HTTP smoke test for a deployed site.
 *
 * Usage:
 *   node scripts/ci/smoke-test.mjs --url https://gwenda-blue.pages.dev
 *   node scripts/ci/smoke-test.mjs --url https://staging.gwenda.co.uk --expected-version 2026.06.11+abc1234
 */
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
const retries = Number(
  getArg("--retries") ?? process.env.SMOKE_TEST_RETRIES ?? "0",
);
const retryDelayMs = Number(
  getArg("--retry-delay-ms") ?? process.env.SMOKE_TEST_RETRY_DELAY_MS ?? "5000",
);

if (!baseUrl) {
  console.error(
    "Usage: smoke-test.mjs --url https://example.pages.dev [--expected-version YYYY.MM.DD+sha]",
  );
  process.exit(1);
}

function errorDetail(err) {
  return err.cause?.message || err.message || String(err);
}

async function checkPath(path, { expectVersionHeader = path === "/" } = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
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
}

async function runChecks() {
  await checkPath("/");
  await checkPath("/robots.txt", { expectVersionHeader: false });
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
