import { readFileSync, writeFileSync, existsSync } from "node:fs";

const HOST = "gwenda.co.uk";

function upsertEnvToken(beaconToken) {
  const envPath = ".env";
  const line = `PUBLIC_CF_BEACON_TOKEN=${beaconToken}`;
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${line}\n`);
    return;
  }
  const env = readFileSync(envPath, "utf8");
  if (/^PUBLIC_CF_BEACON_TOKEN=/m.test(env)) {
    writeFileSync(envPath, env.replace(/^PUBLIC_CF_BEACON_TOKEN=.*$/m, line));
  } else {
    writeFileSync(envPath, `${env.trimEnd()}\n${line}\n`);
  }
}

const token = process.argv[2]?.trim();

if (!token) {
  console.log(`Set up Cloudflare Web Analytics (beacon snippet):

  1. Open https://dash.cloudflare.com → Web Analytics
  2. Add a site → ${HOST}
  3. Manage site → copy the token from the JS snippet
     (data-cf-beacon='{"token": "..."}')

  Then run:
    npm run setup:analytics -- YOUR_TOKEN_HERE

  On deploy, CI resolves the token automatically when possible.
  You can also set GitHub Actions variable PUBLIC_CF_BEACON_TOKEN as fallback.
`);
  process.exit(1);
}

upsertEnvToken(token);
console.log("PUBLIC_CF_BEACON_TOKEN saved to .env");
