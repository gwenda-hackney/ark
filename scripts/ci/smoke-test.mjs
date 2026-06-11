/**
 * Minimal HTTP smoke test for a deployed site.
 *
 * Usage: node scripts/ci/smoke-test.mjs --url https://gwenda-blue.pages.dev
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

if (!baseUrl) {
  console.error("Usage: smoke-test.mjs --url https://example.pages.dev");
  process.exit(1);
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

try {
  await checkPath("/");
  await checkPath("/robots.txt", { expectVersionHeader: false });
  console.log(`Smoke test passed for ${baseUrl}`);
} catch (err) {
  console.error(`Smoke test failed: ${err.message}`);
  process.exit(1);
}
