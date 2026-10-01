#!/usr/bin/env node
/**
 * External uptime checks for production, from outside Cloudflare (#10):
 * UptimeRobot (free plan, account automation@gwenda.co.uk), every 5 minutes,
 * alerting alerts@gwenda.co.uk. The free plan can't create monitors or email
 * contacts through the API, so this only checks: the alerts@ contact is active,
 * every monitor below exists (matched by URL) and alerts it. It prints what to
 * add at dashboard.uptimerobot.com and changes nothing.
 *
 * Needs bw-unlock (UPTIME_ROBOT_API_KEY, the account's main API key, in SM).
 *
 *   npm run setup:uptime
 */
import { listAllSmSecrets } from "./lib/bitwarden-sm.mjs";

const API = "https://api.uptimerobot.com/v2";
const ALERT_EMAIL = "alerts@gwenda.co.uk";
// type 1 = HTTP(s), must answer 2xx/3xx. type 2 = keyword; keyword_type 2
// alerts when the keyword is missing.
const MONITORS = [
  { friendly_name: "gwenda.co.uk", url: "https://gwenda.co.uk", type: 1 },
  { friendly_name: "gwenda.co.uk robots.txt", url: "https://gwenda.co.uk/robots.txt", type: 1 },
  {
    friendly_name: "gwenda.co.uk health",
    url: "https://gwenda.co.uk/health",
    type: 2,
    keyword_type: 2,
    keyword_value: '"service":"gwenda"',
  },
  { friendly_name: "Ops sign-in", url: "https://operations.gwenda.co.uk/gate/", type: 1 },
];

const sameUrl = (a, b) => String(a).replace(/\/$/, "") === String(b).replace(/\/$/, "");

async function call(apiKey, method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ api_key: apiKey, format: "json", ...params }),
  });
  const data = await res.json();
  if (data.stat !== "ok") throw new Error(`UptimeRobot ${method}: ${JSON.stringify(data.error || data)}`);
  return data;
}

async function main() {
  const apiKey = listAllSmSecrets().get("UPTIME_ROBOT_API_KEY")?.trim();
  if (!apiKey) throw new Error("UPTIME_ROBOT_API_KEY is missing from Secrets Manager (ark). Run bw-unlock.");

  const contacts = (await call(apiKey, "getAlertContacts")).alert_contacts || [];
  const alerts = contacts.find((contact) => String(contact.value).toLowerCase() === ALERT_EMAIL);
  let missing = 0;
  if (!alerts) {
    missing += 1;
    console.log(`MISSING alert contact ${ALERT_EMAIL}: add it under Integrations & Team (the group must accept outside mail)`);
  } else if (alerts.status !== 2) {
    // Status 2 is active; anything else means alerts won't arrive.
    missing += 1;
    console.log(`NOT ACTIVE alert contact ${ALERT_EMAIL} (status ${alerts.status}): click the activation link sent to it`);
  } else {
    console.log(`ok      alert contact ${ALERT_EMAIL}`);
  }

  const existing = (await call(apiKey, "getMonitors", { alert_contacts: "1" })).monitors || [];
  for (const monitor of MONITORS) {
    const found = existing.find((item) => sameUrl(item.url, monitor.url));
    if (!found) {
      missing += 1;
      const how =
        monitor.type === 2
          ? `Keyword monitor, alert when keyword ${monitor.keyword_value} does NOT exist`
          : "HTTP(s) monitor";
      console.log(`MISSING ${monitor.url}: add "${monitor.friendly_name}" as a ${how}, every 5 minutes, alerting ${ALERT_EMAIL}`);
      continue;
    }
    const alerted = (found.alert_contacts || []).some((contact) => alerts && String(contact.id) === String(alerts.id));
    if (!alerted) missing += 1;
    console.log(`${alerted ? "ok     " : "NO ALERT"} ${monitor.url} ("${found.friendly_name}")${alerted ? "" : `: tick ${ALERT_EMAIL} as its alert contact`}`);
  }
  if (missing) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
