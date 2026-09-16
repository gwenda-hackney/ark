#!/usr/bin/env node
/**
 * Smoke: unauthenticated ops host redirects to the gate (not Cloudflare Access).
 *
 *   node scripts/smoke-ops-auth.mjs https://gwenda-ops.pages.dev/
 */
const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/smoke-ops-auth.mjs <url>");
  process.exit(2);
}

const res = await fetch(url, { redirect: "manual" });
const location = res.headers.get("location") || "";
const status = res.status;

const ok =
  ([301, 302, 303, 307, 308].includes(status) &&
    (/\/gate\/?/i.test(location) || /\/api\/auth\/login/i.test(location))) ||
  (status === 200 && /gate|Continue with Google|Enter our world/i.test(await res.text()));

if (!ok) {
  console.error(
    `Expected gate/login redirect, got ${status} Location=${location || "(none)"}`,
  );
  process.exit(1);
}

if (/cloudflareaccess\.com/i.test(location) || /\/cdn-cgi\/access\//i.test(location)) {
  console.error(`Access is still intercepting: Location=${location}`);
  process.exit(1);
}

console.log(`OK ${status} → ${location || "gate HTML"}`);
