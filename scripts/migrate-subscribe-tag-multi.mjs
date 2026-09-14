#!/usr/bin/env node
/**
 * Convert subscribe `Tag` from single_select → multiple_select and ensure
 * the `wifi` (and `prelaunch`) options exist.
 *
 * Captive portal merges tags when a guest email already exists (e.g. prelaunch
 * + wifi). Mailchimp sync applies every Tag value.
 *
 * Database tokens only allow row CRUD. Field edits need a JWT from
 * POST /api/user/token-auth/ (Admin or Builder on the workspace).
 *
 * Env: BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD (or interactive TTY prompt)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const API_BASE = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const WIFI_OPTION = process.env.WIFI_SUBSCRIBE_TAG?.trim() || "wifi";
const REQUIRED_OPTIONS = ["prelaunch", WIFI_OPTION];
const TABLE_IDS = (process.env.SUBSCRIBE_TABLE_IDS || "1017358,1024006")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const OPTION_COLORS = {
  prelaunch: "light-blue",
  wifi: "dark-blue",
};

function readEnv(name) {
  const value = process.env[name];
  return value === undefined ? "" : value.trim();
}

function promptHidden(query) {
  return new Promise((resolvePromise) => {
    stdout.write(query);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let password = "";

    const onData = (char) => {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolvePromise(password);
        return;
      }
      if (char === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        process.exit(130);
      }
      if (char === "\u007f") {
        if (password.length > 0) password = password.slice(0, -1);
        return;
      }
      password += char;
    };

    stdin.on("data", onData);
  });
}

async function promptCredentials() {
  let email = readEnv("BASEROW_JWT_EMAIL");
  let password = readEnv("BASEROW_JWT_PASSWORD");
  if (email && password) return { email, password };

  if (!stdin.isTTY) {
    throw new Error(
      "Set BASEROW_JWT_EMAIL and BASEROW_JWT_PASSWORD for non-interactive use.",
    );
  }

  console.log("Log in with your Baserow account (Admin or Builder).");
  console.log("Credentials are not saved. Used once for a short-lived JWT.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (!email) email = (await rl.question("Baserow email: ")).trim();
  } finally {
    rl.close();
  }
  if (!password) password = await promptHidden("Baserow password: ");
  if (!email || !password) throw new Error("Email and password are required.");
  return { email, password };
}

async function baserowRequest(jwt, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `JWT ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail = json?.detail || json?.error || text.slice(0, 300);
    throw new Error(
      `${init.method || "GET"} ${path} → ${response.status}: ${detail}`,
    );
  }
  return json;
}

async function fetchJwt(email, password) {
  const response = await fetch(`${API_BASE}/api/user/token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Baserow login failed (${response.status}): ${payload.detail || payload.error || "check email/password"}`,
    );
  }
  const token = payload.access_token || payload.token;
  if (!token) throw new Error("Baserow login succeeded but no access_token.");
  return token;
}

function buildSelectOptions(existing) {
  const byValue = new Map();
  for (const option of existing ?? []) {
    if (option?.value) byValue.set(option.value, option);
  }
  for (const value of REQUIRED_OPTIONS) {
    if (!byValue.has(value)) {
      byValue.set(value, {
        value,
        color: OPTION_COLORS[value] || "dark-gray",
      });
    }
  }
  return [...byValue.values()].map((option) =>
    option.id
      ? { id: option.id, value: option.value, color: option.color }
      : { value: option.value, color: option.color },
  );
}

async function ensureMultiTag(jwt, tableId) {
  const fields = await baserowRequest(
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const tag = fields.find((field) => field.name === "Tag");
  if (!tag) {
    console.log(`- table ${tableId}: no Tag field, skipped`);
    return;
  }

  if (tag.type !== "single_select" && tag.type !== "multiple_select") {
    console.log(`- table ${tableId}: Tag is ${tag.type}, skipped`);
    return;
  }

  const selectOptions = buildSelectOptions(tag.select_options);
  const payload = {
    type: "multiple_select",
    select_options: selectOptions,
  };

  if (tag.type === "multiple_select") {
    const values = new Set((tag.select_options ?? []).map((o) => o.value));
    const missing = REQUIRED_OPTIONS.filter((v) => !values.has(v));
    if (!missing.length) {
      console.log(`- table ${tableId}: already multiple_select with options`);
      return;
    }
  }

  await baserowRequest(jwt, `/api/database/fields/${tag.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  const from = tag.type;
  console.log(
    `- table ${tableId}: ${from} → multiple_select (${selectOptions.map((o) => o.value).join(", ")})`,
  );
}

async function main() {
  const { email, password } = await promptCredentials();
  const jwt = await fetchJwt(email, password);
  for (const tableId of TABLE_IDS) {
    await ensureMultiTag(jwt, tableId);
  }
  console.log(
    "\nDone. Tag is multiple_select; portal can merge wifi onto existing tags.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
