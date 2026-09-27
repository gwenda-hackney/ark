#!/usr/bin/env node
/**
 * Smoke: unauthenticated ops host redirects to the gate (not Cloudflare Access).
 *
 *   node scripts/smoke-ops-auth.mjs https://gwenda-ops.pages.dev/ [--retries 6] [--retry-delay-ms 5000]
 *
 * A new branch preview's address can answer 404 for a few seconds after the
 * deploy, so 404s, 5xx and network errors are retried; a wrong answer isn't.
 */
const url = process.argv[2];
if (!url || url.startsWith("--")) {
  console.error("Usage: node scripts/smoke-ops-auth.mjs <url> [--retries N] [--retry-delay-ms MS]");
  process.exit(2);
}

function argNumber(name, fallback) {
  const i = process.argv.indexOf(name);
  const value = i > 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const retries = argNumber("--retries", 0);
const delayMs = argNumber("--retry-delay-ms", 5000);

async function check() {
  let res;
  try {
    res = await fetch(url, { redirect: "manual" });
  } catch (error) {
    return { retry: true, message: `Request failed: ${error.message}` };
  }
  const location = res.headers.get("location") || "";
  const status = res.status;
  if (status === 404 || status >= 500) {
    return { retry: true, message: `Not ready: ${status}` };
  }
  if (/cloudflareaccess\.com/i.test(location) || /\/cdn-cgi\/access\//i.test(location)) {
    return { message: `Access is still intercepting: Location=${location}` };
  }
  const ok =
    ([301, 302, 303, 307, 308].includes(status) &&
      (/\/gate\/?/i.test(location) || /\/api\/auth\/login/i.test(location))) ||
    (status === 200 && /gate|Continue with Google|Enter our world/i.test(await res.text()));
  if (!ok) return { message: `Expected gate/login redirect, got ${status} Location=${location || "(none)"}` };
  return { ok: true, message: `OK ${status} → ${location || "gate HTML"}` };
}

for (let attempt = 0; ; attempt += 1) {
  const result = await check();
  if (result.ok) {
    console.log(result.message);
    process.exit(0);
  }
  if (!result.retry || attempt >= retries) {
    console.error(result.message);
    process.exit(1);
  }
  console.log(`${result.message}; retrying in ${delayMs} ms (${attempt + 1}/${retries})`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
