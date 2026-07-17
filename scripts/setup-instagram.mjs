#!/usr/bin/env node
/**
 * Connect @gwendahackney via Meta OAuth (same mechanism as Canva / Buffer).
 *
 * Opens Facebook login, you approve permissions for *our* Meta app, then this
 * script stores INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID in .env.
 *
 * Prereqs (one-time in Meta Developers):
 *   1. Create app at https://developers.facebook.com/
 *   2. Add Facebook Login + Instagram products
 *   3. Valid OAuth redirect: http://localhost:8765/callback
 *   4. Put META_APP_ID and META_APP_SECRET in repo-root .env
 *
 * Usage: npm run setup:instagram
 */
import { createServer } from "node:http";
import { createInterface } from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const GRAPH = "https://graph.facebook.com/v21.0";
const OAUTH = "https://www.facebook.com/v21.0/dialog/oauth";
const REDIRECT_URI = "http://localhost:8765/callback";
const PORT = 8765;

const SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
].join(",");

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env");

function loadEnvFile() {
  const env = {};
  if (!existsSync(envPath)) return env;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function upsertEnv(name, value) {
  let envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(envText)) {
    envText = envText.replace(re, line);
  } else {
    envText = `${envText.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, envText.endsWith("\n") ? envText : `${envText}\n`, "utf8");
}

async function graphGet(path, params) {
  const url = new URL(`${GRAPH}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String(data.error?.message ?? text)
        : text;
    throw new Error(`${path} → ${response.status}: ${message}`);
  }
  return data;
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

function waitForOAuthCode(expectedState) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      if (requestUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<p>Meta OAuth error: ${error}</p><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`Meta OAuth error: ${error}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<p>Invalid OAuth callback.</p>");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<p>Instagram connected for Gwenda. You can close this tab and return to the terminal.</p>",
      );
      server.close();
      resolvePromise(code);
    });

    server.listen(PORT, "127.0.0.1", () => {});
    server.on("error", reject);
  });
}

async function pickPage(pages) {
  if (pages.length === 0) {
    throw new Error("No Facebook Pages returned — link @gwendahackney to a Page first.");
  }
  if (pages.length === 1) return pages[0];

  const rl = createInterface({ input, output });
  try {
    console.log("\nSelect the Facebook Page linked to @gwendahackney:");
    pages.forEach((page, index) => {
      console.log(`  ${index + 1}. ${page.name} (id ${page.id})`);
    });
    const answer = await rl.question("Page number: ");
    const index = Number(answer) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
      throw new Error("Invalid page selection.");
    }
    return pages[index];
  } finally {
    rl.close();
  }
}

async function main() {
  const fileEnv = loadEnvFile();
  const appId = process.env.META_APP_ID?.trim() || fileEnv.META_APP_ID?.trim();
  const appSecret =
    process.env.META_APP_SECRET?.trim() || fileEnv.META_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    console.error(
      "META_APP_ID and META_APP_SECRET are required in repo-root .env.\n" +
        "Create a Meta app first: https://developers.facebook.com/\n" +
        "Add Facebook Login with redirect URI: http://localhost:8765/callback",
    );
    process.exit(1);
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = new URL(OAUTH);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_type", "code");

  console.log("Gwenda Instagram OAuth");
  console.log("======================");
  console.log("");
  console.log("Same flow as Canva: you log into Meta and approve *our* app.");
  console.log("Opening browser…");
  console.log("");
  console.log(authUrl.toString());
  console.log("");

  openBrowser(authUrl.toString());

  console.log(`Waiting for callback on ${REDIRECT_URI} …`);
  const code = await waitForOAuthCode(state);

  console.log("Exchanging authorization code for access token…");
  const shortLived = await graphGet("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: REDIRECT_URI,
    code,
  });

  const shortToken = shortLived.access_token;
  if (!shortToken) throw new Error("Meta did not return an access token.");

  console.log("Exchanging for long-lived token…");
  const longLived = await graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  const accessToken = longLived.access_token;
  if (!accessToken) throw new Error("Long-lived token exchange failed.");

  console.log("Finding Facebook Page + Instagram account…");
  const accounts = await graphGet("/me/accounts", {
    access_token: accessToken,
    fields: "id,name,access_token",
  });

  const pages = accounts.data ?? [];
  const page = await pickPage(pages);

  const pageToken = page.access_token ?? accessToken;
  const igLookup = await graphGet(`/${page.id}`, {
    access_token: pageToken,
    fields: "instagram_business_account{id,username}",
  });

  const igAccount = igLookup.instagram_business_account;
  if (!igAccount?.id) {
    throw new Error(
      `Page "${page.name}" has no linked Instagram professional account. ` +
        "Connect @gwendahackney in Meta Business Suite first.",
    );
  }

  upsertEnv("META_APP_ID", appId);
  upsertEnv("META_APP_SECRET", appSecret);
  upsertEnv("INSTAGRAM_ACCESS_TOKEN", pageToken);
  upsertEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID", String(igAccount.id));

  console.log("");
  console.log(`Connected Instagram @${igAccount.username ?? "gwendahackney"} (id ${igAccount.id}).`);
  console.log("Updated repo-root .env:");
  console.log("  INSTAGRAM_ACCESS_TOKEN");
  console.log("  INSTAGRAM_BUSINESS_ACCOUNT_ID");
  console.log("");
  console.log("Next:");
  console.log("  npm run setup:event-ops          # sync to GitHub secrets (optional)");
  console.log("  npm run event-invites -- --send  # after ClickUp guest + DM thread exists");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
