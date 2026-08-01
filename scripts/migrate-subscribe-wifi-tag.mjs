#!/usr/bin/env node
/**
 * Add the `wifi` option to the subscribe table `Tag` single-select field.
 *
 * The captive portal writes rows with Tag=wifi; Baserow rejects select values
 * that are not existing options.
 *
 * Database tokens only allow row CRUD. Editing field options needs a JWT
 * from POST /api/user/token-auth/ (Admin or Builder on the workspace).
 *
 * Env: BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD (or interactive TTY prompt)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const API_BASE = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const TAG_OPTION = process.env.WIFI_SUBSCRIBE_TAG?.trim() || "wifi";
const TABLE_IDS = (
  process.env.SUBSCRIBE_TABLE_IDS || "1017358,1024006"
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

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
  console.log("Credentials are not saved — used once for a short-lived JWT.\n");

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
    body: JSON.stringify({ username: email, password }),
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

async function ensureTagOption(jwt, tableId) {
  const fields = await baserowRequest(
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const tag = fields.find((field) => field.name === "Tag");
  if (!tag) {
    console.log(`- table ${tableId}: no Tag field, skipped`);
    return;
  }
  if (tag.type !== "single_select") {
    console.log(`- table ${tableId}: Tag is ${tag.type}, no options needed`);
    return;
  }

  const options = tag.select_options ?? [];
  if (options.some((option) => option.value === TAG_OPTION)) {
    console.log(`- table ${tableId}: "${TAG_OPTION}" already an option`);
    return;
  }

  await baserowRequest(jwt, `/api/database/fields/${tag.id}/`, {
    method: "PATCH",
    body: JSON.stringify({
      select_options: [
        ...options.map((option) => ({
          id: option.id,
          value: option.value,
          color: option.color,
        })),
        { value: TAG_OPTION, color: "dark-blue" },
      ],
    }),
  });
  console.log(`- table ${tableId}: added "${TAG_OPTION}" option`);
}

async function main() {
  const { email, password } = await promptCredentials();
  const jwt = await fetchJwt(email, password);
  for (const tableId of TABLE_IDS) {
    await ensureTagOption(jwt, tableId);
  }
  console.log("\nDone. Captive portal rows can now use Tag=" + TAG_OPTION);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
