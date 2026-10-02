#!/usr/bin/env node
/**
 * External uptime checks for production, from outside Cloudflare (#10):
 * UptimeRobot (free plan, account alerts@gwenda.co.uk), every 5 minutes,
 * alerting alerts@gwenda.co.uk. Creates any monitor below that's missing
 * (matched by URL) and makes sure every one alerts alerts@. Uses the v3 API:
 * v2's newMonitor refuses free accounts, and v2 misreports the account's own
 * email contact as not active.
 *
 * Needs bw-unlock (UPTIME_ROBOT_API_KEY__PRODUCTION, the account's main API key, in SM).
 *
 *   npm run setup:uptime                 create what's missing
 *   npm run setup:uptime -- --dry-run    only report
 */
import { productionSecretValues } from "./lib/bitwarden-sm.mjs";

const API = "https://api.uptimerobot.com/v3";
const ALERT_EMAIL = "alerts@gwenda.co.uk";
const DRY_RUN = process.argv.includes("--dry-run");
const MONITORS = [
  { type: "HTTP", friendlyName: "gwenda.co.uk", url: "https://gwenda.co.uk" },
  { type: "HTTP", friendlyName: "gwenda.co.uk robots.txt", url: "https://gwenda.co.uk/robots.txt" },
  {
    type: "KEYWORD",
    friendlyName: "gwenda.co.uk health",
    url: "https://gwenda.co.uk/health",
    keywordValue: '"service":"gwenda"',
    keywordType: "ALERT_NOT_EXISTS",
    keywordCaseType: 0,
  },
  { type: "HTTP", friendlyName: "Ops sign-in", url: "https://operations.gwenda.co.uk/gate/" },
];

const sameUrl = (a, b) => String(a).replace(/\/$/, "") === String(b).replace(/\/$/, "");

async function call(apiKey, method, path, body) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`UptimeRobot ${method} ${path}: ${res.status} ${text.replaceAll(apiKey, "***").slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const apiKey = productionSecretValues().get("UPTIME_ROBOT_API_KEY")?.trim();
  if (!apiKey) throw new Error("UPTIME_ROBOT_API_KEY__PRODUCTION is missing from Secrets Manager (ark). Run bw-unlock.");

  const contacts = (await call(apiKey, "GET", "alert-contacts")).data || [];
  const alerts = contacts.find((contact) => String(contact.value).toLowerCase() === ALERT_EMAIL);
  if (!alerts) {
    console.log(`MISSING alert contact ${ALERT_EMAIL}: add it under Integrations & Team (the group must accept outside mail)`);
    process.exitCode = 1;
    return;
  }
  let problems = 0;
  if (alerts.status !== "Active") {
    problems += 1;
    console.log(`NOT ACTIVE alert contact ${ALERT_EMAIL} (${alerts.status}): click the activation link sent to it`);
  } else {
    console.log(`ok      alert contact ${ALERT_EMAIL}`);
  }
  const assigned = [{ alertContactId: alerts.id, threshold: 0, recurrence: 0 }];

  const existing = (await call(apiKey, "GET", "monitors")).data || [];
  for (const monitor of MONITORS) {
    const found = existing.find((item) => sameUrl(item.url, monitor.url));
    if (!found) {
      if (DRY_RUN) {
        problems += 1;
        console.log(`MISSING ${monitor.url} (dry run, not created)`);
        continue;
      }
      await call(apiKey, "POST", "monitors", { ...monitor, interval: 300, timeout: 30, assignedAlertContacts: assigned });
      console.log(`created ${monitor.url} ("${monitor.friendlyName}")`);
      continue;
    }
    const alerted = (found.assignedAlertContacts || []).some((contact) => contact.alertContactId === alerts.id);
    if (alerted) {
      console.log(`ok      ${monitor.url} ("${found.friendlyName}")`);
    } else if (DRY_RUN) {
      problems += 1;
      console.log(`NO ALERT ${monitor.url} (dry run, not changed)`);
    } else {
      await call(apiKey, "PATCH", `monitors/${found.id}`, {
        assignedAlertContacts: [...(found.assignedAlertContacts || []), ...assigned],
      });
      console.log(`alerted ${monitor.url}: now alerts ${ALERT_EMAIL}`);
    }
  }
  if (problems) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
