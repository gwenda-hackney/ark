/**
 * Minimal HTTP smoke test for a deployed site.
 *
 * Usage:
 *   node scripts/ci/smoke-test.mjs --url https://gwenda-blue.pages.dev
 *   node scripts/ci/smoke-test.mjs --url https://staging.gwenda.co.uk --retries 18
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
const retries = Number(
  getArg("--retries") ?? process.env.SMOKE_TEST_RETRIES ?? "0",
);
const retryDelayMs = Number(
  getArg("--retry-delay-ms") ?? process.env.SMOKE_TEST_RETRY_DELAY_MS ?? "5000",
);

if (!baseUrl) {
  console.error("Usage: smoke-test.mjs --url https://example.pages.dev");
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
  if (expectVersionHeader && !res.headers.get("x-gwenda-version")) {
    throw new Error(`${url} missing X-Gwenda-Version header`);
  }
  console.log(`OK ${url} (${res.status})`);
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
