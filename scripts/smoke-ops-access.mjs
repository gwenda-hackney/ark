#!/usr/bin/env node
/**
 * Unauthenticated smoke: the ops host must bounce to Cloudflare Access.
 *
 *   node scripts/smoke-ops-access.mjs https://gwenda-ops.pages.dev/
 */
import { isAccessChallenge } from "./lib/ops-access.mjs";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: node scripts/smoke-ops-access.mjs <url>");
  process.exit(1);
}

const target = raw.replace(/\/gate\/?$/, "/");

async function probe() {
  const res = await fetch(target, { redirect: "manual" });
  const location = res.headers.get("location") || "";
  return {
    status: res.status,
    location,
    ok: isAccessChallenge(res.status, location),
  };
}

for (let i = 1; i <= 12; i += 1) {
  try {
    const result = await probe();
    if (result.ok) {
      console.log(`OK ${target} → ${result.status} ${result.location}`);
      process.exit(0);
    }
    console.log(
      `Waiting for Access challenge… (${i}/12) got ${result.status} ${result.location || "(no Location)"}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Waiting for Access challenge… (${i}/12) ${message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

console.error(`Ops Access challenge not seen at ${target}`);
process.exit(1);
