#!/usr/bin/env node
/**
 * Upload (or update) a Mailchimp Classic/user HTML template.
 *
 *   node scripts/with-env.mjs node scripts/upload-mailchimp-template.mjs \
 *     brand/email/mailchimp-grand-opening.html "Gwenda · Grand Opening"
 *
 * Optional third arg: existing template id to PATCH instead of create.
 * Needs MAILCHIMP_API_KEY in .env (with data-centre suffix).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , htmlPath, nameArg, templateIdArg] = process.argv;
if (!htmlPath || !nameArg) {
  console.error(
    'usage: upload-mailchimp-template.mjs <html-path> <name> [template-id]',
  );
  process.exit(1);
}

const key = process.env.MAILCHIMP_API_KEY?.trim();
if (!key) throw new Error("MAILCHIMP_API_KEY is missing");

const dc = key.split("-").pop();
if (!dc) throw new Error("API key missing data-centre suffix");

const html = readFileSync(resolve(htmlPath), "utf8");
const base = `https://${dc}.api.mailchimp.com/3.0`;
const auth = `Basic ${Buffer.from(`anystring:${key}`).toString("base64")}`;
const name = nameArg;

async function main() {
  const updating = Boolean(templateIdArg?.trim());
  const url = updating
    ? `${base}/templates/${templateIdArg.trim()}`
    : `${base}/templates`;
  const res = await fetch(url, {
    method: updating ? "PATCH" : "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updating ? { name, html } : { name, html }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mailchimp ${res.status}: ${text.slice(0, 500)}`);
  const tpl = JSON.parse(text);
  console.log(
    JSON.stringify(
      { ok: true, id: tpl.id, name: tpl.name, type: tpl.type, updated: updating },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
